package com.tcm.inquiry.modules.knowledge.ai;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicReference;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.document.Document;
import org.springframework.ai.vectorstore.SearchRequest;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.ai.vectorstore.filter.Filter;
import org.springframework.ai.vectorstore.filter.FilterExpressionBuilder;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.tcm.inquiry.common.sse.SsePhaseEvents;
import com.tcm.inquiry.config.TcmApiProperties;
import com.tcm.inquiry.infrastructure.vectorstore.RedisStackKnowledgeKeywordSearcher;
import com.tcm.inquiry.modules.knowledge.config.KnowledgeProperties;
import com.tcm.inquiry.modules.knowledge.config.RagHybridExecutorConfig;
import com.tcm.inquiry.modules.knowledge.dto.req.KnowledgeQueryRequest;
import com.tcm.inquiry.modules.knowledge.dto.resp.KnowledgeQueryResponse;
import com.tcm.inquiry.modules.knowledge.dto.resp.KnowledgeRetrievedPassage;
import com.tcm.inquiry.modules.knowledge.ai.retrieval.KnowledgeRetrievalMatchType;
import com.tcm.inquiry.modules.knowledge.ai.retrieval.TcmQueryTermExtractor;
import com.tcm.inquiry.modules.knowledge.repository.KnowledgeBaseRepository;

import reactor.core.scheduler.Schedulers;

@Service
public class KnowledgeRagService {

    private static final Logger log = LoggerFactory.getLogger(KnowledgeRagService.class);

    private static final String META_MATCH_TYPE = "match_type";
    private static final String META_MERGED_SCORE = "retrieval_score";

    private final KnowledgeBaseRepository knowledgeBaseRepository;
    private final VectorStore vectorStore;
    private final ChatModel chatModel;
    private final KnowledgeProperties knowledgeProperties;
    private final Executor sseAsyncExecutor;
    private final TcmApiProperties apiProperties;
    private final ObjectProvider<RedisStackKnowledgeKeywordSearcher> keywordSearcherProvider;
    private final Executor hybridExecutor;

    public KnowledgeRagService(
            KnowledgeBaseRepository knowledgeBaseRepository,
            VectorStore vectorStore,
            @Qualifier("openAiChatModel") ChatModel chatModel,
            KnowledgeProperties knowledgeProperties,
            @Qualifier("sseAsyncExecutor") Executor sseAsyncExecutor,
            TcmApiProperties apiProperties,
            ObjectProvider<RedisStackKnowledgeKeywordSearcher> keywordSearcherProvider,
            @Qualifier(RagHybridExecutorConfig.RAG_HYBRID_EXECUTOR) Executor hybridExecutor) {
        this.knowledgeBaseRepository = knowledgeBaseRepository;
        this.vectorStore = vectorStore;
        this.chatModel = chatModel;
        this.knowledgeProperties = knowledgeProperties;
        this.sseAsyncExecutor = sseAsyncExecutor;
        this.apiProperties = apiProperties;
        this.keywordSearcherProvider = keywordSearcherProvider;
        this.hybridExecutor = hybridExecutor;
    }

    public KnowledgeQueryResponse query(Long knowledgeBaseId, KnowledgeQueryRequest req) {
        KnowledgeContextBundle bundle =
                retrieveContext(
                        knowledgeBaseId,
                        req.getMessage(),
                        req.getTopK(),
                        req.getSimilarityThreshold());
        String userPrompt = buildUserPrompt(bundle, req.getMessage());

        ChatClient client =
                ChatClient.builder(chatModel).defaultSystem(KnowledgeRagPrompts.RAG_SYSTEM).build();
        String answer = client.prompt().user(userPrompt).call().content();

        return new KnowledgeQueryResponse(
                answer, new ArrayList<>(bundle.sources()), bundle.retrievedChunks(), bundle.passages());
    }

    /**
     * RAG 流式回答：先发 {@code event: phase}（检索/生成），再 {@code meta}，正文增量同问诊，最后 {@code
     * [DONE]}。
     */
    public SseEmitter streamQuery(Long knowledgeBaseId, KnowledgeQueryRequest req) {
        SseEmitter emitter = new SseEmitter(600_000L);

        sseAsyncExecutor.execute(
                () -> {
                    try {
                        SsePhaseEvents.sendPhase(
                                emitter, "rag_retrieval", "知识库混合检索中…");
                        KnowledgeContextBundle bundle =
                                retrieveContext(
                                        knowledgeBaseId,
                                        req.getMessage(),
                                        req.getTopK(),
                                        req.getSimilarityThreshold());
                        emitter.send(
                                SseEmitter.event()
                                        .name("meta")
                                        .data(
                                                Map.of(
                                                        "sources",
                                                        bundle.sources(),
                                                        "retrievedChunks",
                                                        bundle.retrievedChunks(),
                                                        "passages",
                                                        bundle.passages())));
                        SsePhaseEvents.sendPhase(
                                emitter, "model_stream", "大模型流式生成中…");

                        String userPrompt = buildUserPrompt(bundle, req.getMessage());
                        ChatClient client =
                                ChatClient.builder(chatModel)
                                        .defaultSystem(KnowledgeRagPrompts.RAG_SYSTEM)
                                        .build();
                        var streamSpec = client.prompt().user(userPrompt).stream();
                        AtomicReference<Throwable> errorRef = new AtomicReference<>();

                        streamSpec
                                .content()
                                .subscribeOn(Schedulers.boundedElastic())
                                .doOnNext(
                                        token -> {
                                            try {
                                                emitter.send(SseEmitter.event().data(token));
                                            } catch (IOException e) {
                                                errorRef.compareAndSet(null, e);
                                                emitter.completeWithError(e);
                                            }
                                        })
                                .doOnError(
                                        ex -> {
                                            try {
                                                emitter.send(
                                                        SseEmitter.event()
                                                                .name("error")
                                                                .data(streamErrorMessage(ex)));
                                            } catch (IOException ignored) {
                                                // ignore
                                            }
                                            emitter.completeWithError(ex);
                                        })
                                .doOnComplete(
                                        () -> {
                                            if (errorRef.get() != null) {
                                                return;
                                            }
                                            try {
                                                emitter.send(SseEmitter.event().data("[DONE]"));
                                            } catch (IOException e) {
                                                emitter.completeWithError(e);
                                                return;
                                            }
                                            emitter.complete();
                                        })
                                .subscribe();
                    } catch (Exception ex) {
                        try {
                            emitter.send(
                                    SseEmitter.event()
                                            .name("error")
                                            .data(streamErrorMessage(ex)));
                        } catch (IOException ignored) {
                            // ignore
                        }
                        emitter.completeWithError(ex);
                    }
                });

        emitter.onTimeout(emitter::complete);
        emitter.onCompletion(() -> {});

        return emitter;
    }

    private static String buildUserPrompt(KnowledgeContextBundle bundle, String rawMessage) {
        return "参考资料：\n"
                + bundle.contextText()
                + "\n用户问题：\n"
                + rawMessage.trim()
                + "\n请根据资料作答。"
                + " 摘录标题中 [semantic]/[keyword]/[hybrid] 表示召回类型，请在引用时使用与摘录编号一致的括号标注（知识库检索）。\n";
    }

    private String streamErrorMessage(Throwable ex) {
        if (apiProperties.isExposeErrorDetails()) {
            return ex.getMessage() != null ? ex.getMessage() : "stream error";
        }
        return "stream error";
    }

    /**
     * 混合检索：向量语义与 Redis 全文（可选）并行，合并去重并按专名命中加权。
     */
    public KnowledgeContextBundle retrieveContext(
            Long knowledgeBaseId,
            String queryText,
            Integer topKOverride,
            Double similarityThresholdOverride) {
        if (!knowledgeBaseRepository.existsById(knowledgeBaseId)) {
            throw new IllegalArgumentException("knowledge base not found: " + knowledgeBaseId);
        }

        Filter.Expression kbOnly =
                new FilterExpressionBuilder().eq("kb_id", String.valueOf(knowledgeBaseId)).build();

        int topK =
                topKOverride != null && topKOverride > 0
                        ? topKOverride
                        : knowledgeProperties.getDefaultTopK();
        double th =
                similarityThresholdOverride != null
                        ? similarityThresholdOverride
                        : knowledgeProperties.getDefaultSimilarityThreshold();

        SearchRequest.Builder searchBuilder =
                SearchRequest.builder()
                        .query(queryText.trim())
                        .topK(topK)
                        .filterExpression(kbOnly);
        if (th <= 0) {
            searchBuilder.similarityThresholdAll();
        } else {
            searchBuilder.similarityThreshold(th);
        }

        List<String> terms =
                TcmQueryTermExtractor.extractTerms(
                        queryText, knowledgeProperties.getHybridMaxExtractedTerms());

        SearchRequest semRequest = searchBuilder.build();

        CompletableFuture<List<Document>> semanticFuture =
                CompletableFuture.supplyAsync(() -> vectorStore.similaritySearch(semRequest), hybridExecutor);

        CompletableFuture<List<Document>> keywordFuture =
                CompletableFuture.supplyAsync(
                        () -> keywordBranch(knowledgeBaseId, terms), hybridExecutor);

        List<Document> semHits = semanticFuture.join();
        List<Document> kwHits = keywordFuture.join();
        List<Document> merged = mergeSemanticAndKeyword(semHits, kwHits, terms, topK);

        if (log.isDebugEnabled()) {
            log.debug(
                    "knowledge hybrid retrieve kbId={} terms={} semanticHits={} keywordBranchSize={} merged={}",
                    knowledgeBaseId,
                    terms.size(),
                    semHits.size(),
                    kwHits.size(),
                    merged.size());
        }

        return buildBundleFromDocuments(merged);
    }

    private List<Document> keywordBranch(Long knowledgeBaseId, List<String> terms) {
        if (!knowledgeProperties.isHybridRetrievalEnabled() || terms.isEmpty()) {
            return List.of();
        }
        RedisStackKnowledgeKeywordSearcher searcher = keywordSearcherProvider.getIfAvailable();
        if (searcher == null) {
            return List.of();
        }
        return searcher.searchKnowledgeBase(
                String.valueOf(knowledgeBaseId),
                terms,
                knowledgeProperties.getHybridKeywordTopK());
    }

    private List<Document> mergeSemanticAndKeyword(
            List<Document> semantic,
            List<Document> keyword,
            List<String> queryTerms,
            int finalTopK) {
        Map<String, HitAcc> byId = new LinkedHashMap<>();
        for (Document d : semantic) {
            String id = Objects.requireNonNullElse(d.getId(), "");
            if (id.isEmpty()) {
                continue;
            }
            double semScore = d.getScore() != null ? d.getScore() : 0.55;
            HitAcc acc = HitAcc.fromSemantic(d, semScore);
            byId.put(id, acc);
        }
        for (Document d : keyword) {
            String id = Objects.requireNonNullElse(d.getId(), "");
            if (id.isEmpty()) {
                continue;
            }
            double kwBase = d.getScore() != null ? d.getScore() : 0.4;
            double herb = herbOverlapBonus(d.getText(), queryTerms);
            double kwScore = Math.min(1.0, kwBase + herb);
            byId.merge(
                    id,
                    HitAcc.fromKeyword(d, kwScore),
                    (existing, incoming) -> {
                        existing.merge(incoming);
                        return existing;
                    });
        }
        return byId.values().stream()
                .sorted(Comparator.comparingDouble(HitAcc::rank).reversed())
                .limit(Math.max(1, finalTopK))
                .map(HitAcc::toDocument)
                .toList();
    }

    private static double herbOverlapBonus(String text, List<String> terms) {
        if (text == null || text.isBlank() || terms == null) {
            return 0;
        }
        double bonus = 0;
        for (String t : terms) {
            if (t != null && t.length() >= 2 && text.contains(t)) {
                bonus += 0.065 * Math.min(t.length(), 8);
            }
        }
        return Math.min(0.4, bonus);
    }

    private KnowledgeContextBundle buildBundleFromDocuments(List<Document> hits) {
        StringBuilder context = new StringBuilder();
        Set<String> sources = new LinkedHashSet<>();
        List<KnowledgeRetrievedPassage> passages = new ArrayList<>();
        int idx = 1;
        for (Document d : hits) {
            String t = d.getText();
            Map<String, Object> meta = d.getMetadata();
            String mt =
                    meta.getOrDefault(META_MATCH_TYPE, KnowledgeRetrievalMatchType.SEMANTIC.getWire())
                            .toString();
            double sc =
                    meta.get(META_MERGED_SCORE) instanceof Number n
                            ? n.doubleValue()
                            : (d.getScore() != null ? d.getScore() : 0);
            if (t != null && !t.isBlank()) {
                context.append("[摘录")
                        .append(idx)
                        .append("][")
                        .append(mt)
                        .append("][相关度≈")
                        .append(String.format("%.2f", sc))
                        .append("]\n");
                context.append(t).append("\n---\n");
            }
            Object src = meta.get("source");
            String source = src != null ? src.toString() : "";
            if (!source.isBlank()) {
                sources.add(source);
            }
            String excerpt = t != null ? t : "";
            if (excerpt.length() > 4000) {
                excerpt = excerpt.substring(0, 4000) + "…";
            }
            passages.add(
                    new KnowledgeRetrievedPassage(
                            idx,
                            d.getId() != null ? d.getId() : "",
                            source,
                            matchTypeFromWire(mt),
                            sc,
                            excerpt,
                            "knowledge"));
            idx++;
        }

        String ctxText = context.toString();
        if (ctxText.isBlank()) {
            ctxText = "（当前知识库中暂无与问题相关的检索片段。）\n";
        }

        return new KnowledgeContextBundle(ctxText, new ArrayList<>(sources), hits.size(), passages);
    }

    /** 修复 passages 中 matchType 枚举解析：使用 wire 字符串更安全 */
    private static KnowledgeRetrievalMatchType matchTypeFromWire(String w) {
        for (KnowledgeRetrievalMatchType v : KnowledgeRetrievalMatchType.values()) {
            if (v.getWire().equalsIgnoreCase(w)) {
                return v;
            }
        }
        return KnowledgeRetrievalMatchType.SEMANTIC;
    }

    private static final class HitAcc {
        private final String id;
        private String text;
        private final Map<String, Object> metadata = new HashMap<>();
        private boolean hasSemantic;
        private boolean hasKeyword;
        private double semScore;
        private double kwScore;

        static HitAcc fromSemantic(Document d, double semScore) {
            HitAcc a = new HitAcc(d.getId());
            a.text = d.getText();
            a.metadata.putAll(d.getMetadata());
            a.hasSemantic = true;
            a.semScore = semScore;
            return a;
        }

        static HitAcc fromKeyword(Document d, double kwScore) {
            HitAcc a = new HitAcc(d.getId());
            a.text = d.getText();
            a.metadata.putAll(d.getMetadata());
            a.hasKeyword = true;
            a.kwScore = kwScore;
            return a;
        }

        HitAcc(String id) {
            this.id = id != null ? id : "";
        }

        void merge(HitAcc o) {
            if (o.hasSemantic) {
                this.hasSemantic = true;
                this.semScore = Math.max(this.semScore, o.semScore);
                if (o.text != null && !o.text.isBlank()) {
                    this.text = o.text;
                }
                this.metadata.putAll(o.metadata);
            }
            if (o.hasKeyword) {
                this.hasKeyword = true;
                this.kwScore = Math.max(this.kwScore, o.kwScore);
            }
            if (this.text == null || this.text.isBlank()) {
                this.text = o.text;
            }
        }

        double rank() {
            if (hasSemantic && hasKeyword) {
                return 0.45 * semScore + 0.48 * kwScore + 0.18;
            }
            if (hasSemantic) {
                return semScore;
            }
            return kwScore;
        }

        Document toDocument() {
            KnowledgeRetrievalMatchType mt =
                    hasSemantic && hasKeyword
                            ? KnowledgeRetrievalMatchType.HYBRID
                            : hasSemantic
                                    ? KnowledgeRetrievalMatchType.SEMANTIC
                                    : KnowledgeRetrievalMatchType.KEYWORD;
            double r = rank();
            Map<String, Object> m = new HashMap<>(metadata);
            m.put(META_MATCH_TYPE, mt.getWire());
            m.put(META_MERGED_SCORE, r);
            return Document.builder()
                    .id(id)
                    .text(text != null ? text : "")
                    .metadata(m)
                    .score(r)
                    .build();
        }
    }
}

package com.tcm.inquiry.modules.literature.ai;

import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicReference;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.document.Document;
import org.springframework.ai.vectorstore.SearchRequest;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.ai.vectorstore.filter.FilterExpressionBuilder;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.tcm.inquiry.common.sse.SsePhaseEvents;
import com.tcm.inquiry.config.TcmApiProperties;
import com.tcm.inquiry.modules.knowledge.ai.KnowledgeContextBundle;
import com.tcm.inquiry.modules.knowledge.ai.retrieval.KnowledgeRetrievalMatchType;
import com.tcm.inquiry.modules.knowledge.dto.resp.KnowledgeRetrievedPassage;
import com.tcm.inquiry.modules.knowledge.config.KnowledgeProperties;
import com.tcm.inquiry.modules.literature.dto.req.LiteratureQueryRequest;
import com.tcm.inquiry.modules.literature.dto.resp.LiteratureQueryResponse;
import com.tcm.inquiry.modules.literature.repository.LiteratureUploadRepository;

import reactor.core.scheduler.Schedulers;

@Service
public class LiteratureRagService {

    private final LiteratureUploadRepository literatureUploadRepository;
    private final VectorStore vectorStore;
    private final ChatModel chatModel;
    private final KnowledgeProperties knowledgeProperties;
    private final Executor sseAsyncExecutor;
    private final TcmApiProperties apiProperties;

    public LiteratureRagService(
            LiteratureUploadRepository literatureUploadRepository,
            VectorStore vectorStore,
            @Qualifier("openAiChatModel") ChatModel chatModel,
            KnowledgeProperties knowledgeProperties,
            @Qualifier("sseAsyncExecutor") Executor sseAsyncExecutor,
            TcmApiProperties apiProperties) {
        this.literatureUploadRepository = literatureUploadRepository;
        this.vectorStore = vectorStore;
        this.chatModel = chatModel;
        this.knowledgeProperties = knowledgeProperties;
        this.sseAsyncExecutor = sseAsyncExecutor;
        this.apiProperties = apiProperties;
    }

    /**
     * 供问诊流式接口注入文献向量摘录（与知识库 RAG 二选一，由上层校验）。
     */
    public KnowledgeContextBundle retrieveContextForConsultation(
            String tempCollectionId,
            String userQuery,
            Integer topK,
            Double similarityThreshold) {
        if (tempCollectionId == null || tempCollectionId.isBlank()) {
            throw new IllegalArgumentException("literatureCollectionId is required");
        }
        LiteratureQueryRequest req = new LiteratureQueryRequest();
        req.setMessage(userQuery != null ? userQuery.trim() : "");
        req.setTopK(topK);
        req.setSimilarityThreshold(similarityThreshold);
        return retrieveContext(tempCollectionId.trim(), req);
    }

    public LiteratureQueryResponse query(String tempCollectionId, LiteratureQueryRequest req) {
        KnowledgeContextBundle bundle = retrieveContext(tempCollectionId, req);
        String userPrompt = buildUserPrompt(bundle, req.getMessage());

        ChatClient client =
                ChatClient.builder(chatModel).defaultSystem(LiteratureRagPrompts.RAG_SYSTEM).build();
        String answer = client.prompt().user(userPrompt).call().content();

        return new LiteratureQueryResponse(answer, new ArrayList<>(bundle.sources()), bundle.retrievedChunks());
    }

    /**
     * 与 {@link com.tcm.inquiry.modules.knowledge.ai.KnowledgeRagService#streamQuery} 协议一致（含 {@code
     * phase} 编排事件）。
     */
    public SseEmitter streamQuery(String tempCollectionId, LiteratureQueryRequest req) {
        SseEmitter emitter = new SseEmitter(600_000L);

        sseAsyncExecutor.execute(
                () -> {
                    try {
                        SsePhaseEvents.sendPhase(
                                emitter, "rag_retrieval", "临时文献库向量检索中…");
                        KnowledgeContextBundle bundle = retrieveContext(tempCollectionId, req);
                        emitter.send(
                                SseEmitter.event()
                                        .name("meta")
                                        .data(
                                                Map.of(
                                                        "sources",
                                                        bundle.sources(),
                                                        "retrievedChunks",
                                                        bundle.retrievedChunks())));
                        SsePhaseEvents.sendPhase(
                                emitter, "model_stream", "大模型流式生成中…");

                        String userPrompt = buildUserPrompt(bundle, req.getMessage());
                        ChatClient client =
                                ChatClient.builder(chatModel)
                                        .defaultSystem(LiteratureRagPrompts.RAG_SYSTEM)
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

    /**
     * 供 {@code literature_retrieval_tool} 调用：仅向量检索并返回摘录包，不调用大模型。
     */
    public KnowledgeContextBundle retrieveContextForAgentTool(
            String tempCollectionId,
            String query,
            Integer topK,
            Double similarityThreshold) {
        LiteratureQueryRequest req = new LiteratureQueryRequest();
        req.setMessage(query != null ? query : "");
        req.setTopK(topK);
        req.setSimilarityThreshold(similarityThreshold);
        return retrieveContext(tempCollectionId.trim(), req);
    }

    private KnowledgeContextBundle retrieveContext(
            String tempCollectionId, LiteratureQueryRequest req) {
        if (!literatureUploadRepository.existsByTempCollectionId(tempCollectionId)) {
            throw new IllegalArgumentException("literature collection not found: " + tempCollectionId);
        }

        var filter =
                new FilterExpressionBuilder().eq("lit_collection_id", tempCollectionId.trim()).build();

        int topK =
                req.getTopK() != null && req.getTopK() > 0
                        ? req.getTopK()
                        : knowledgeProperties.getDefaultTopK();
        double th =
                req.getSimilarityThreshold() != null
                        ? req.getSimilarityThreshold()
                        : knowledgeProperties.getDefaultSimilarityThreshold();

        SearchRequest.Builder searchBuilder =
                SearchRequest.builder().query(req.getMessage().trim()).topK(topK).filterExpression(filter);
        if (th <= 0) {
            searchBuilder.similarityThresholdAll();
        } else {
            searchBuilder.similarityThreshold(th);
        }

        List<Document> hits = vectorStore.similaritySearch(searchBuilder.build());

        StringBuilder context = new StringBuilder();
        Set<String> sources = new LinkedHashSet<>();
        List<KnowledgeRetrievedPassage> passages = new ArrayList<>();
        int idx = 1;
        for (Document d : hits) {
            String t = d.getText();
            if (t != null && !t.isBlank()) {
                context.append(t).append("\n---\n");
            }
            Object src = d.getMetadata().get("source");
            String source = src != null ? src.toString() : "";
            if (!source.isBlank()) {
                sources.add(source);
            }
            String excerpt = t != null ? t : "";
            if (excerpt.length() > 4000) {
                excerpt = excerpt.substring(0, 4000) + "…";
            }
            double sc = d.getScore() != null ? d.getScore() : 0.0;
            passages.add(
                    new KnowledgeRetrievedPassage(
                            idx,
                            d.getId() != null ? d.getId() : "",
                            source,
                            KnowledgeRetrievalMatchType.SEMANTIC,
                            sc,
                            excerpt,
                            "literature"));
            idx++;
        }

        String ctxText = context.toString();
        if (ctxText.isBlank()) {
            ctxText = "（当前文献中暂无与问题相关的检索片段。）\n";
        }

        return new KnowledgeContextBundle(ctxText, new ArrayList<>(sources), hits.size(), passages);
    }

    private static String buildUserPrompt(KnowledgeContextBundle bundle, String rawMessage) {
        return "参考资料：\n"
                + bundle.contextText()
                + "\n用户问题：\n"
                + rawMessage.trim()
                + "\n请根据资料作答。";
    }

    private String streamErrorMessage(Throwable ex) {
        if (apiProperties.isExposeErrorDetails()) {
            return ex.getMessage() != null ? ex.getMessage() : "stream error";
        }
        return "stream error";
    }
}

package com.tcm.inquiry.modules.consultation.service;

import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicReference;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.ollama.api.OllamaOptions;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.tcm.inquiry.config.TcmApiProperties;
import com.tcm.inquiry.modules.consultation.ai.ConsultationPrompts;
import com.tcm.inquiry.modules.consultation.dto.ConsultationChatRequest;
import com.tcm.inquiry.modules.consultation.entity.ChatMessage;
import com.tcm.inquiry.modules.consultation.repository.ChatMessageRepository;
import com.tcm.inquiry.modules.consultation.repository.ChatSessionRepository;
import com.tcm.inquiry.modules.knowledge.ai.KnowledgeContextBundle;
import com.tcm.inquiry.modules.knowledge.ai.KnowledgeRagService;
import com.tcm.inquiry.modules.literature.ai.LiteratureRagService;

import reactor.core.scheduler.Schedulers;

@Service
public class ConsultationChatService {

    private static final Logger log = LoggerFactory.getLogger(ConsultationChatService.class);

    private static final double DEFAULT_TEMPERATURE = 0.7;
    /** Ollama 常用默认 top_p，与官方示例一致；客户端未传时使用。 */
    private static final double DEFAULT_TOP_P = 0.9;
    private static final int DEFAULT_MAX_HISTORY_TURNS = 10;

    private final ChatModel chatModel;
    private final ChatSessionRepository chatSessionRepository;
    private final ChatMessageRepository chatMessageRepository;
    private final ConsultationMessageStore consultationMessageStore;
    private final Executor sseAsyncExecutor;
    private final TcmApiProperties apiProperties;
    private final KnowledgeRagService knowledgeRagService;
    private final LiteratureRagService literatureRagService;

    /**
     * 默认对话模型：与 {@code application.yml} 中 {@code spring.ai.ollama.chat.options.model} 对齐，
     * 便于在代码侧组装 {@link OllamaOptions#builder()} 时使用与全局 Bean 一致的模型名；
     * 实际部署前请在 Ollama 中执行 {@code ollama pull} 确保本地已存在该 Tag。
     */
    @Value("${spring.ai.ollama.chat.options.model:gemma4:e4b}")
    private String defaultChatModelName;

    public ConsultationChatService(
            @Qualifier("ollamaChatModel") ChatModel chatModel,
            ChatSessionRepository chatSessionRepository,
            ChatMessageRepository chatMessageRepository,
            ConsultationMessageStore consultationMessageStore,
            @Qualifier("sseAsyncExecutor") Executor sseAsyncExecutor,
            TcmApiProperties apiProperties,
            KnowledgeRagService knowledgeRagService,
            LiteratureRagService literatureRagService) {
        this.chatModel = chatModel;
        this.chatSessionRepository = chatSessionRepository;
        this.chatMessageRepository = chatMessageRepository;
        this.consultationMessageStore = consultationMessageStore;
        this.sseAsyncExecutor = sseAsyncExecutor;
        this.apiProperties = apiProperties;
        this.knowledgeRagService = knowledgeRagService;
        this.literatureRagService = literatureRagService;
    }

    /**
     * 建立 SSE：拉历史 →（可选）检索知识库并发 {@code meta} → 流式调用 Ollama → 结束后异步落库。
     */
    public SseEmitter streamChat(ConsultationChatRequest req) {
        if (!chatSessionRepository.existsById(req.getSessionId())) {
            throw new IllegalArgumentException("session not found: " + req.getSessionId());
        }

        double temperature =
                req.getTemperature() != null ? req.getTemperature() : DEFAULT_TEMPERATURE;
        // 解析 top_p：显式传入则约束在 (0,1]，避免 Ollama 拒参或异常采样行为
        double topP =
                req.getTopP() != null
                        ? Math.min(1.0, Math.max(1e-6, req.getTopP()))
                        : DEFAULT_TOP_P;
        int maxTurns =
                req.getMaxHistoryTurns() != null
                        ? Math.max(1, req.getMaxHistoryTurns())
                        : DEFAULT_MAX_HISTORY_TURNS;

        List<Message> historyMessages = buildHistoryMessages(req.getSessionId(), maxTurns);
        String userInput = req.getMessage().trim();
        String litRaw = req.getLiteratureCollectionId();
        boolean hasLiterature = litRaw != null && !litRaw.isBlank();
        if (req.getKnowledgeBaseId() != null && hasLiterature) {
            throw new IllegalArgumentException("不能同时挂载知识库与文献库");
        }

        KnowledgeContextBundle kbBundle = null;
        KnowledgeContextBundle litBundle = null;
        String modelUserInput;
        if (req.getKnowledgeBaseId() != null) {
            kbBundle =
                    knowledgeRagService.retrieveContext(
                            req.getKnowledgeBaseId(),
                            userInput,
                            req.getRagTopK(),
                            req.getRagSimilarityThreshold());
            modelUserInput =
                    "【知识库摘录】\n"
                            + kbBundle.contextText()
                            + "\n\n【用户主诉】\n"
                            + userInput;
        } else if (hasLiterature) {
            litBundle =
                    literatureRagService.retrieveContextForConsultation(
                            litRaw.trim(),
                            userInput,
                            req.getLiteratureRagTopK(),
                            req.getLiteratureSimilarityThreshold());
            modelUserInput =
                    "【文献摘录】\n"
                            + litBundle.contextText()
                            + "\n\n【用户主诉】\n"
                            + userInput;
        } else {
            modelUserInput = userInput;
        }

        SseEmitter emitter = new SseEmitter(600_000L);
        if (kbBundle != null || litBundle != null) {
            try {
                Map<String, Object> metaPayload = new LinkedHashMap<>();
                if (kbBundle != null) {
                    metaPayload.put("sources", kbBundle.sources());
                    metaPayload.put("retrievedChunks", kbBundle.retrievedChunks());
                    metaPayload.put("knowledgeBaseId", req.getKnowledgeBaseId());
                } else {
                    metaPayload.put("sources", litBundle.sources());
                    metaPayload.put("retrievedChunks", litBundle.retrievedChunks());
                    metaPayload.put("literatureCollectionId", litRaw.trim());
                }
                emitter.send(
                        SseEmitter.event().name("meta").data(metaPayload));
            } catch (IOException e) {
                emitter.completeWithError(e);
                return emitter;
            }
        }

        ChatClient chatClient =
                ChatClient.builder(chatModel).defaultSystem(ConsultationPrompts.SYSTEM).build();

        // 将 temperature / top_p 一并下推到 Ollama Chat API，保证前端滑块与真实推理一致
        var streamSpec =
                chatClient
                        .prompt()
                        .options(
                                OllamaOptions.builder()
                                        .temperature(temperature)
                                        .topP(topP)
                                        .build())
                        .messages(historyMessages)
                        .user(modelUserInput)
                        .stream();

        StringBuilder assistantAcc = new StringBuilder();
        AtomicReference<Throwable> errorRef = new AtomicReference<>();

        sseAsyncExecutor.execute(
                () ->
                        streamSpec
                                .content()
                                .subscribeOn(Schedulers.boundedElastic())
                                .doOnNext(
                                        token -> {
                                            assistantAcc.append(token);
                                            try {
                                                emitter.send(SseEmitter.event().data(token));
                                            } catch (IOException e) {
                                                errorRef.compareAndSet(null, e);
                                                emitter.completeWithError(e);
                                            }
                                        })
                                .doOnError(
                                        ex -> {
                                            log.warn("consultation stream error", ex);
                                            errorRef.compareAndSet(null, ex);
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
                                            String fullReply = assistantAcc.toString();
                                            sseAsyncExecutor.execute(
                                                    () -> {
                                                        try {
                                                            consultationMessageStore.saveTurn(
                                                                    req.getSessionId(),
                                                                    userInput,
                                                                    fullReply,
                                                                    defaultChatModelName,
                                                                    temperature,
                                                                    topP);
                                                        } catch (Exception ex) {
                                                            log.error(
                                                                    "Failed to persist consultation turn sessionId={}",
                                                                    req.getSessionId(),
                                                                    ex);
                                                        }
                                                    });
                                        })
                                .subscribe());

        emitter.onTimeout(
                () -> {
                    log.warn("SSE timeout sessionId={}", req.getSessionId());
                    emitter.complete();
                });
        emitter.onCompletion(() -> log.debug("SSE completed sessionId={}", req.getSessionId()));

        return emitter;
    }

    private List<Message> buildHistoryMessages(Long sessionId, int maxTurns) {
        List<ChatMessage> rows = chatMessageRepository.findBySession_IdOrderByIdAsc(sessionId);
        if (rows.size() > maxTurns) {
            rows = rows.subList(rows.size() - maxTurns, rows.size());
        }
        List<Message> messages = new ArrayList<>(rows.size() * 2);
        for (ChatMessage row : rows) {
            messages.add(new UserMessage(row.getUserMessage()));
            messages.add(new AssistantMessage(row.getAssistantMessage()));
        }
        return messages;
    }

    private String streamErrorMessage(Throwable ex) {
        if (apiProperties.isExposeErrorDetails()) {
            return ex.getMessage() != null ? ex.getMessage() : "stream error";
        }
        return "stream error";
    }
}

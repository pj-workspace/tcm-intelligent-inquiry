package com.tcm.inquiry.modules.consultation.service;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tcm.inquiry.common.sse.SseAssistantEvents;
import com.tcm.inquiry.common.sse.SsePhaseEvents;
import com.tcm.inquiry.config.TcmApiProperties;
import com.tcm.inquiry.modules.agent.AgentRunResponse;
import com.tcm.inquiry.modules.agent.service.AgentService;
import com.tcm.inquiry.modules.agent.ConsultationToolProgressNotifier;
import com.tcm.inquiry.modules.agent.tools.AgentReActToolsFactory;
import com.tcm.inquiry.modules.consultation.ai.ConsultationPrompts;
import com.tcm.inquiry.modules.consultation.dto.ConsultationChatRequest;
import com.tcm.inquiry.modules.consultation.dto.ConsultationReportSsePayload;
import com.tcm.inquiry.modules.consultation.dto.TcmDiagnosisReport;
import com.tcm.inquiry.modules.consultation.entity.ChatMessage;
import com.tcm.inquiry.modules.consultation.repository.ChatMessageRepository;
import com.tcm.inquiry.modules.consultation.repository.ChatSessionRepository;
import com.tcm.inquiry.modules.consultation.sse.ConsultationJsonReportStreamSniffer;

import reactor.core.scheduler.Schedulers;

@Service
public class ConsultationChatService {

    private static final Logger log = LoggerFactory.getLogger(ConsultationChatService.class);

    private static final double DEFAULT_TEMPERATURE = 0.7;
    /** 常用默认 top_p；客户端未传时使用。 */
    private static final double DEFAULT_TOP_P = 0.9;
    private static final int DEFAULT_MAX_HISTORY_TURNS = 10;

    private final ChatModel chatModel;
    private final ChatSessionRepository chatSessionRepository;
    private final ChatMessageRepository chatMessageRepository;
    private final ConsultationMessageStore consultationMessageStore;
    private final Executor sseAsyncExecutor;
    private final TcmApiProperties apiProperties;
    private final AgentService agentService;
    private final ObjectMapper objectMapper;
    private final TcmSafetyGuardrailService safetyGuardrailService;

    /**
     * 默认对话模型名（落库展示用），与 {@code spring.ai.openai.chat.options.model} 一致。
     */
    @Value("${spring.ai.openai.chat.options.model:qwen-max}")
    private String defaultChatModelName;

    public ConsultationChatService(
            @Qualifier("openAiChatModel") ChatModel chatModel,
            ChatSessionRepository chatSessionRepository,
            ChatMessageRepository chatMessageRepository,
            ConsultationMessageStore consultationMessageStore,
            @Qualifier("sseAsyncExecutor") Executor sseAsyncExecutor,
            TcmApiProperties apiProperties,
            AgentService agentService,
            ObjectMapper objectMapper,
            TcmSafetyGuardrailService safetyGuardrailService) {
        this.chatModel = chatModel;
        this.chatSessionRepository = chatSessionRepository;
        this.chatMessageRepository = chatMessageRepository;
        this.consultationMessageStore = consultationMessageStore;
        this.sseAsyncExecutor = sseAsyncExecutor;
        this.apiProperties = apiProperties;
        this.agentService = agentService;
        this.objectMapper = objectMapper;
        this.safetyGuardrailService = safetyGuardrailService;
    }

    private void emitConsultationReport(SseEmitter sseEmitter, TcmDiagnosisReport report)
            throws IOException {
        var safety = safetyGuardrailService.checkHerbIncompatibility(report.herbs());
        sseEmitter.send(
                SseEmitter.event()
                        .name("report")
                        .data(new ConsultationReportSsePayload(report, safety)));
    }

    /**
     * 建立 SSE 流水线（对齐 claw-code「事件化编排」思路）：
     * <ul>
     *   <li>启用 ReAct 时：{@code phase} 报告上下文与工具阶段 → 工具与模型由 Spring AI 编排；
     *       正文到达后以 token 流写入 SSE（工具执行期间无正文流属预期）；</li>
     *   <li>未启用 ReAct 时：直连 {@link ChatModel} 的流式路径。</li>
     * </ul>
     */
    public SseEmitter streamChat(ConsultationChatRequest req) {
        if (!chatSessionRepository.existsById(req.getSessionId())) {
            throw new IllegalArgumentException("session not found: " + req.getSessionId());
        }

        double temperature =
                req.getTemperature() != null ? req.getTemperature() : DEFAULT_TEMPERATURE;
        // 解析 top_p：显式传入则约束在 (0,1]，避免服务端拒参或异常采样行为
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
        String litTrimmed = litRaw != null && !litRaw.isBlank() ? litRaw.trim() : null;

        SseEmitter emitter = new SseEmitter(600_000L);
        sseAsyncExecutor.execute(
                () -> {
                    if (agentService.isReactToolsEnabled()) {
                        runConsultationReactPipeline(
                                emitter,
                                req,
                                historyMessages,
                                userInput,
                                litTrimmed,
                                temperature,
                                topP);
                    } else {
                        runLegacyModelStreamPipeline(
                                emitter, req, historyMessages, userInput, temperature, topP);
                    }
                });

        emitter.onTimeout(
                () -> {
                    log.warn("SSE timeout sessionId={}", req.getSessionId());
                    emitter.complete();
                });
        emitter.onCompletion(() -> log.debug("SSE completed sessionId={}", req.getSessionId()));

        return emitter;
    }

    private void runConsultationReactPipeline(
            SseEmitter emitter,
            ConsultationChatRequest req,
            List<Message> historyMessages,
            String userInput,
            String literatureCollectionId,
            double temperature,
            double topP) {
        try {
            int turnPairs = historyMessages.size() / 2;
            StringBuilder ctx = new StringBuilder();
            ctx.append("历史约 ").append(turnPairs).append(" 轮对话");
            if (req.getKnowledgeBaseId() != null) {
                ctx.append("；已绑默认知识库 #").append(req.getKnowledgeBaseId());
            }
            if (literatureCollectionId != null) {
                ctx.append("；文献库 ").append(truncateId(literatureCollectionId));
            }
            if (StringUtils.hasText(req.getHerbImageBase64())) {
                ctx.append("；附图为识图工具做准备");
            }
            SsePhaseEvents.sendPhase(
                    emitter,
                    "context_prepare",
                    "准备上下文与工具参数",
                    ctx.toString(),
                    1);

            SsePhaseEvents.sendPhase(
                    emitter,
                    "agent_orchestration",
                    "ReAct：模型按需调用工具",
                    "知识库检索 · 文献检索 · 药材识图（由模型自决）",
                    2);

            String herbB64 =
                    StringUtils.hasText(req.getHerbImageBase64()) ? req.getHerbImageBase64().trim() : null;
            String herbMime =
                    StringUtils.hasText(req.getHerbImageMimeType())
                            ? req.getHerbImageMimeType().trim()
                            : null;

            Map<String, Object> reactToolOverlay = new LinkedHashMap<>();
            reactToolOverlay.put(
                    AgentReActToolsFactory.CTX_CONSULTATION_TOOL_PROGRESS,
                    (ConsultationToolProgressNotifier)
                            (toolName, phase, detail) -> {
                                try {
                                    SseAssistantEvents.sendToolUseLifecycle(
                                            emitter, toolName, phase, detail);
                                } catch (IOException e) {
                                    log.debug(
                                            "tool progress sse sessionId={}: {}",
                                            req.getSessionId(),
                                            e.toString());
                                }
                            });

            ConsultationJsonReportStreamSniffer reportSniffer =
                    new ConsultationJsonReportStreamSniffer(objectMapper);

            agentService.runConsultationReActStreaming(
                    historyMessages,
                    userInput,
                    req.getKnowledgeBaseId(),
                    req.getRagTopK(),
                    req.getRagSimilarityThreshold(),
                    literatureCollectionId,
                    req.getLiteratureRagTopK(),
                    req.getLiteratureSimilarityThreshold(),
                    herbB64,
                    herbMime,
                    temperature,
                    topP,
                    reactToolOverlay,
                    metaShell -> {
                        try {
                            sendReActMeta(
                                    emitter,
                                    metaShell,
                                    req.getKnowledgeBaseId(),
                                    literatureCollectionId);
                            SsePhaseEvents.sendPhase(
                                    emitter,
                                    "content_stream",
                                    "模型流式生成答复",
                                    "工具阶段已完成，正在推送正文",
                                    3);
                        } catch (IOException e) {
                            throw new UncheckedIOException(e);
                        }
                    },
                    token -> {
                        reportSniffer.append(
                                token,
                                r -> {
                                    try {
                                        emitConsultationReport(emitter, r);
                                    } catch (IOException e) {
                                        throw new UncheckedIOException(e);
                                    }
                                });
                        try {
                            SseAssistantEvents.sendTextDelta(emitter, token);
                        } catch (IOException e) {
                            throw new UncheckedIOException(e);
                        }
                    },
                    finalResp -> {
                        try {
                            SseAssistantEvents.sendMessageStop(emitter);
                            emitter.send(SseEmitter.event().data("[DONE]"));
                            emitter.complete();
                        } catch (IOException e) {
                            emitter.completeWithError(e);
                            return;
                        }
                        sseAsyncExecutor.execute(
                                () -> {
                                    try {
                                        consultationMessageStore.saveTurn(
                                                req.getSessionId(),
                                                userInput,
                                                finalResp.assistant(),
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
                    },
                    ex -> {
                        log.warn(
                                "consultation ReAct stream error sessionId={}",
                                req.getSessionId(),
                                ex);
                        try {
                            emitter.send(
                                    SseEmitter.event()
                                            .name("error")
                                            .data(streamErrorMessage(ex)));
                        } catch (IOException ignored) {
                            // 客户端已断开
                        }
                        emitter.completeWithError(ex);
                    });
        } catch (Exception ex) {
            log.warn(
                    "consultation ReAct pipeline error sessionId={}",
                    req.getSessionId(),
                    ex);
            try {
                emitter.send(
                        SseEmitter.event().name("error").data(streamErrorMessage(ex)));
            } catch (IOException ignored) {
                // 客户端已断开时忽略
            }
            emitter.completeWithError(ex);
        }
    }

    private void sendReActMeta(
            SseEmitter emitter,
            AgentRunResponse react,
            Long requestKbId,
            String literatureCollectionId)
            throws IOException {
        List<String> kb = react.knowledgeSources() == null ? List.of() : react.knowledgeSources();
        List<String> lit = react.literatureSources() == null ? List.of() : react.literatureSources();
        LinkedHashSet<String> merged = new LinkedHashSet<>();
        merged.addAll(kb);
        merged.addAll(lit);
        List<String> sources = new ArrayList<>(merged);

        Map<String, Object> metaPayload = new LinkedHashMap<>();
        metaPayload.put("type", "meta");
        metaPayload.put("sources", sources);
        metaPayload.put("knowledgeSources", kb);
        metaPayload.put("literatureSources", lit);
        metaPayload.put("retrievedChunks", kb.size() + lit.size());
        metaPayload.put("knowledgeBaseId", requestKbId);
        metaPayload.put("literatureCollectionId", literatureCollectionId);
        metaPayload.put("mode", react.mode());
        metaPayload.put("pipeline", "react_tools");
        metaPayload.put("kbSourceCount", kb.size());
        metaPayload.put("litSourceCount", lit.size());
        emitter.send(SseEmitter.event().name("meta").data(metaPayload));
    }

    private static String truncateId(String id) {
        if (id == null) {
            return "";
        }
        String t = id.trim();
        return t.length() > 14 ? t.substring(0, 12) + "…" : t;
    }

    private void runLegacyModelStreamPipeline(
            SseEmitter emitter,
            ConsultationChatRequest req,
            List<Message> historyMessages,
            String userInput,
            double temperature,
            double topP) {
        try {
            SsePhaseEvents.sendPhase(
                    emitter,
                    "model_stream",
                    "直连大模型（未走 ReAct）",
                    "流式 token 输出",
                    1);
            subscribeConsultationModelStream(
                    emitter, req, historyMessages, userInput, temperature, topP, userInput);
        } catch (Exception ex) {
            log.warn(
                    "consultation legacy pipeline error sessionId={}",
                    req.getSessionId(),
                    ex);
            try {
                emitter.send(
                        SseEmitter.event().name("error").data(streamErrorMessage(ex)));
            } catch (IOException ignored) {
                // 客户端已断开时忽略
            }
            emitter.completeWithError(ex);
        }
    }

    private void subscribeConsultationModelStream(
            SseEmitter emitter,
            ConsultationChatRequest req,
            List<Message> historyMessages,
            String modelUserInput,
            double temperature,
            double topP,
            String userInput) {
        ChatClient chatClient =
                ChatClient.builder(chatModel).defaultSystem(ConsultationPrompts.SYSTEM).build();

        // 将 temperature / top_p 一并下推到兼容 OpenAI Chat API，保证前端滑块与真实推理一致
        var streamSpec =
                chatClient
                        .prompt()
                        .options(
                                OpenAiChatOptions.builder()
                                        .temperature(temperature)
                                        .topP(topP)
                                        .build())
                        .messages(historyMessages)
                        .user(modelUserInput)
                        .stream();

        StringBuilder assistantAcc = new StringBuilder();
        AtomicReference<Throwable> errorRef = new AtomicReference<>();
        AtomicBoolean firstToken = new AtomicBoolean(true);
        ConsultationJsonReportStreamSniffer reportSniffer =
                new ConsultationJsonReportStreamSniffer(objectMapper);

        streamSpec
                .content()
                .subscribeOn(Schedulers.boundedElastic())
                .doOnNext(
                        token -> {
                            if (firstToken.compareAndSet(true, false)) {
                                try {
                                    SsePhaseEvents.sendPhase(
                                            emitter,
                                            "model_stream",
                                            "模型流式生成中",
                                            "首包已到达",
                                            2);
                                } catch (IOException ignored) {
                                    // 阶段条失败不影响正文流
                                }
                            }
                            assistantAcc.append(token);
                            reportSniffer.append(
                                    token,
                                    r -> {
                                        try {
                                            emitConsultationReport(emitter, r);
                                        } catch (IOException e) {
                                            errorRef.compareAndSet(null, e);
                                            emitter.completeWithError(e);
                                        }
                                    });
                            if (errorRef.get() != null) {
                                return;
                            }
                            try {
                                SseAssistantEvents.sendTextDelta(emitter, token);
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
                                SseAssistantEvents.sendMessageStop(emitter);
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
                .subscribe();
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

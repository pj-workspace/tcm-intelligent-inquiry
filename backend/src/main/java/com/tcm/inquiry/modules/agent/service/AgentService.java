package com.tcm.inquiry.modules.agent.service;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.content.Media;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.MimeTypeUtils;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import reactor.core.scheduler.Schedulers;

import com.tcm.inquiry.config.AiConfig;
import com.tcm.inquiry.modules.agent.AgentRunRequest;
import com.tcm.inquiry.modules.agent.AgentRunResponse;
import com.tcm.inquiry.modules.agent.ai.AgentPrompts;
import com.tcm.inquiry.modules.agent.tools.AgentReActToolsFactory;
import com.tcm.inquiry.modules.consultation.ai.ConsultationPrompts;
import com.tcm.inquiry.modules.knowledge.ai.KnowledgeContextBundle;
import com.tcm.inquiry.modules.knowledge.ai.KnowledgeRagService;

@Service
public class AgentService {

    private static final Logger log = LoggerFactory.getLogger(AgentService.class);

    private record ReactToolBundle(
            Map<String, Object> toolCtx, List<String> kbSourcesAcc, List<String> litSourcesAcc) {}

    /** 问诊 ReAct：ChatClient + 工具上下文已就绪，供阻塞调用或流式订阅共用。 */
    private record PreparedConsultationReAct(
            ChatClient client,
            OpenAiChatOptions opts,
            ReactToolBundle bundle,
            List<Message> history,
            String userTrimmed) {}

    private final ChatModel textChatModel;
    private final ChatModel visionChatModel;
    private final KnowledgeRagService knowledgeRagService;
    private final AgentAppConfigService agentAppConfigService;
    private final AgentReActToolsFactory agentReActToolsFactory;

    @Value("${tcm.dashscope.vision-model:qwen-vl-max}")
    private String defaultVisionModelName;

    @Value("${tcm.agent.enable-react-tools:true}")
    private boolean enableReactTools;

    public AgentService(
            @Qualifier("openAiChatModel") ChatModel textChatModel,
            @Qualifier(AiConfig.VISION_CHAT_MODEL) ChatModel visionChatModel,
            KnowledgeRagService knowledgeRagService,
            AgentAppConfigService agentAppConfigService,
            AgentReActToolsFactory agentReActToolsFactory) {
        this.textChatModel = textChatModel;
        this.visionChatModel = visionChatModel;
        this.knowledgeRagService = knowledgeRagService;
        this.agentAppConfigService = agentAppConfigService;
        this.agentReActToolsFactory = agentReActToolsFactory;
    }

    public AgentRunResponse runJson(AgentRunRequest req) {
        if (req == null || !StringUtils.hasText(req.task())) {
            throw new IllegalArgumentException("task is required");
        }
        return run(
                req.task(),
                req.knowledgeBaseId(),
                req.ragTopK(),
                req.ragSimilarityThreshold(),
                List.of(),
                req.herbImageBase64(),
                req.herbImageMimeType(),
                req.literatureCollectionId(),
                req.literatureRagTopK(),
                req.literatureSimilarityThreshold());
    }

    public AgentRunResponse runMultipart(
            String task,
            Long knowledgeBaseId,
            Integer ragTopK,
            Double ragSimilarityThreshold,
            MultipartFile[] imageParts) {
        if (!StringUtils.hasText(task)) {
            throw new IllegalArgumentException("task is required");
        }
        List<MultipartFile> images =
                imageParts == null
                        ? List.of()
                        : Arrays.stream(imageParts)
                                .filter(Objects::nonNull)
                                .filter(f -> !f.isEmpty())
                                .toList();
        // 多模态直连视觉模型，不注入 herb Base64 ToolContext；若需 ReAct + herb_image 工具，请走 JSON 的 herbImageBase64（问诊前端已统一该路径）。
        return run(
                task.trim(),
                knowledgeBaseId,
                ragTopK,
                ragSimilarityThreshold,
                images,
                null,
                null,
                null,
                null,
                null);
    }

    /**
     * 问诊专用：多轮历史 + 用户最新一轮正文，由模型在单请求内自行编排知识库 / 文献 / 识图工具（ReAct）。
     */
    public AgentRunResponse runConsultationReAct(
            List<Message> historyMessages,
            String userMessage,
            Long knowledgeBaseId,
            Integer ragTopK,
            Double ragSimilarityThreshold,
            String literatureCollectionId,
            Integer literatureRagTopK,
            Double literatureSimilarityThreshold,
            String herbImageBase64,
            String herbImageMimeType,
            double temperature,
            double topP) {

        if (!enableReactTools) {
            throw new IllegalStateException("ReAct tools are disabled");
        }
        PreparedConsultationReAct p =
                prepareConsultationReAct(
                        historyMessages,
                        userMessage,
                        knowledgeBaseId,
                        ragTopK,
                        ragSimilarityThreshold,
                        literatureCollectionId,
                        literatureRagTopK,
                        literatureSimilarityThreshold,
                        herbImageBase64,
                        herbImageMimeType,
                        temperature,
                        topP);
        String answer =
                p.client()
                        .prompt()
                        .options(p.opts())
                        .messages(p.history())
                        .user(p.userTrimmed())
                        .call()
                        .content();

        return new AgentRunResponse(
                answer,
                List.copyOf(p.bundle().kbSourcesAcc()),
                "react+tools",
                List.of(),
                List.copyOf(p.bundle().litSourcesAcc()));
    }

    /**
     * 问诊 ReAct 的流式版本：在工具阶段结束后，将模型生成正文的 token 流式交给 {@code onToken}，
     * 避免「整段答文落盘后再假分块 SSE」导致的无流式观感。
     *
     * @param onBeforeContentStream 首个正文 token 到达前调用一次，{@code assistant} 为空串，仅用于 meta 来源等
     */
    public void runConsultationReActStreaming(
            List<Message> historyMessages,
            String userMessage,
            Long knowledgeBaseId,
            Integer ragTopK,
            Double ragSimilarityThreshold,
            String literatureCollectionId,
            Integer literatureRagTopK,
            Double literatureSimilarityThreshold,
            String herbImageBase64,
            String herbImageMimeType,
            double temperature,
            double topP,
            Consumer<AgentRunResponse> onBeforeContentStream,
            Consumer<String> onToken,
            Consumer<AgentRunResponse> onSuccess,
            Consumer<Throwable> onError) {

        if (!enableReactTools) {
            onError.accept(new IllegalStateException("ReAct tools are disabled"));
            return;
        }
        final PreparedConsultationReAct p;
        try {
            p =
                    prepareConsultationReAct(
                            historyMessages,
                            userMessage,
                            knowledgeBaseId,
                            ragTopK,
                            ragSimilarityThreshold,
                            literatureCollectionId,
                            literatureRagTopK,
                            literatureSimilarityThreshold,
                            herbImageBase64,
                            herbImageMimeType,
                            temperature,
                            topP);
        } catch (RuntimeException ex) {
            onError.accept(ex);
            return;
        }

        StringBuilder assistantAcc = new StringBuilder();
        AtomicBoolean beforeStreamEmitted = new AtomicBoolean(false);
        Runnable emitMetaShell =
                () -> {
                    if (beforeStreamEmitted.compareAndSet(false, true)) {
                        onBeforeContentStream.accept(
                                new AgentRunResponse(
                                        "",
                                        List.copyOf(p.bundle().kbSourcesAcc()),
                                        "react+tools",
                                        List.of(),
                                        List.copyOf(p.bundle().litSourcesAcc())));
                    }
                };

        try {
            p.client()
                    .prompt()
                    .options(p.opts())
                    .messages(p.history())
                    .user(p.userTrimmed())
                    .stream()
                    .content()
                    .subscribeOn(Schedulers.boundedElastic())
                    .doOnNext(
                            token -> {
                                emitMetaShell.run();
                                assistantAcc.append(token);
                                onToken.accept(token);
                            })
                    .doOnComplete(
                            () -> {
                                emitMetaShell.run();
                                onSuccess.accept(
                                        new AgentRunResponse(
                                                assistantAcc.toString(),
                                                List.copyOf(p.bundle().kbSourcesAcc()),
                                                "react+tools",
                                                List.of(),
                                                List.copyOf(p.bundle().litSourcesAcc())));
                            })
                    .blockLast(Duration.ofMinutes(12));
        } catch (Throwable ex) {
            log.warn("问诊 ReAct 流式失败（可检查模型/兼容接口是否支持 tools+stream）: {}", ex.toString());
            onError.accept(ex);
        }
    }

    private PreparedConsultationReAct prepareConsultationReAct(
            List<Message> historyMessages,
            String userMessage,
            Long knowledgeBaseId,
            Integer ragTopK,
            Double ragSimilarityThreshold,
            String literatureCollectionId,
            Integer literatureRagTopK,
            Double literatureSimilarityThreshold,
            String herbImageBase64,
            String herbImageMimeType,
            double temperature,
            double topP) {

        if (!StringUtils.hasText(userMessage)) {
            throw new IllegalArgumentException("message is required");
        }

        ReactToolBundle bundle =
                buildReactToolBundle(
                        knowledgeBaseId,
                        ragTopK,
                        ragSimilarityThreshold,
                        literatureCollectionId,
                        literatureRagTopK,
                        literatureSimilarityThreshold,
                        herbImageBase64,
                        herbImageMimeType);

        String reactSystem =
                ConsultationPrompts.SYSTEM + "\n\n" + AgentPrompts.REACT_TOOLS_APPENDIX;

        ChatClient client =
                ChatClient.builder(textChatModel)
                        .defaultSystem(reactSystem)
                        .defaultToolCallbacks(agentReActToolsFactory.buildToolCallbacks())
                        .defaultToolContext(bundle.toolCtx())
                        .build();

        OpenAiChatOptions opts =
                OpenAiChatOptions.builder().temperature(temperature).topP(topP).build();

        List<Message> history = historyMessages == null ? List.of() : historyMessages;
        return new PreparedConsultationReAct(client, opts, bundle, history, userMessage.trim());
    }

    public boolean isReactToolsEnabled() {
        return enableReactTools;
    }

    private AgentRunResponse run(
            String task,
            Long knowledgeBaseId,
            Integer ragTopK,
            Double ragSimilarityThreshold,
            List<MultipartFile> images,
            String herbImageBase64,
            String herbImageMimeType,
            String literatureCollectionId,
            Integer literatureRagTopK,
            Double literatureSimilarityThreshold) {

        var appCfg = agentAppConfigService.getOrCreateEntity();
        String textSystem =
                StringUtils.hasText(appCfg.getTextSystemPrompt())
                        ? appCfg.getTextSystemPrompt()
                        : AgentPrompts.AGENT_SYSTEM;
        String visionSystem =
                StringUtils.hasText(appCfg.getVisionSystemPrompt())
                        ? appCfg.getVisionSystemPrompt()
                        : AgentPrompts.VISION_SYSTEM;
        String visionModel =
                StringUtils.hasText(appCfg.getVisionModelName())
                        ? appCfg.getVisionModelName().trim()
                        : defaultVisionModelName;

        boolean hasImage = images != null && !images.isEmpty();
        if (hasImage) {
            return runVisionPath(
                    task,
                    knowledgeBaseId,
                    ragTopK,
                    ragSimilarityThreshold,
                    images,
                    visionSystem,
                    visionModel);
        }

        // —— 纯文本路径：优先启用 Spring AI 工具循环（ReAct），失败时回退为旧的「线性 RAG 注入」行为
        if (enableReactTools) {
            try {
                return runTextWithReActTools(
                        task,
                        knowledgeBaseId,
                        ragTopK,
                        ragSimilarityThreshold,
                        herbImageBase64,
                        herbImageMimeType,
                        literatureCollectionId,
                        literatureRagTopK,
                        literatureSimilarityThreshold,
                        textSystem);
            } catch (Exception ex) {
                log.warn("ReAct 工具编排失败，回退到线性对话（不注册 tools）: {}", ex.toString());
            }
        }

        return runLinearTextChat(
                task, knowledgeBaseId, ragTopK, ragSimilarityThreshold, textSystem);
    }

    private ReactToolBundle buildReactToolBundle(
            Long knowledgeBaseId,
            Integer ragTopK,
            Double ragSimilarityThreshold,
            String literatureCollectionId,
            Integer literatureRagTopK,
            Double literatureSimilarityThreshold,
            String herbImageBase64,
            String herbImageMimeType) {

        List<String> kbSourcesAcc = new ArrayList<>();
        List<String> litSourcesAcc = new ArrayList<>();
        Map<String, Object> toolCtx = new LinkedHashMap<>();
        toolCtx.put(AgentReActToolsFactory.CTX_KNOWLEDGE_SOURCES_COLLECTOR, kbSourcesAcc);
        toolCtx.put(AgentReActToolsFactory.CTX_LITERATURE_SOURCES_COLLECTOR, litSourcesAcc);

        Long cfgKb = agentAppConfigService.getOrCreateEntity().getDefaultKnowledgeBaseId();
        Long effectiveKb = knowledgeBaseId != null ? knowledgeBaseId : cfgKb;
        if (effectiveKb != null) {
            toolCtx.put(AgentReActToolsFactory.CTX_DEFAULT_KNOWLEDGE_BASE_ID, effectiveKb);
        }
        if (ragTopK != null) {
            toolCtx.put(AgentReActToolsFactory.CTX_DEFAULT_RAG_TOP_K, ragTopK);
        }
        if (ragSimilarityThreshold != null) {
            toolCtx.put(AgentReActToolsFactory.CTX_DEFAULT_RAG_SIMILARITY, ragSimilarityThreshold);
        }
        if (StringUtils.hasText(literatureCollectionId)) {
            toolCtx.put(
                    AgentReActToolsFactory.CTX_DEFAULT_LITERATURE_COLLECTION_ID,
                    literatureCollectionId.trim());
        }
        if (literatureRagTopK != null) {
            toolCtx.put(AgentReActToolsFactory.CTX_DEFAULT_LITERATURE_RAG_TOP_K, literatureRagTopK);
        }
        if (literatureSimilarityThreshold != null) {
            toolCtx.put(
                    AgentReActToolsFactory.CTX_DEFAULT_LITERATURE_SIMILARITY, literatureSimilarityThreshold);
        }
        if (StringUtils.hasText(herbImageBase64)) {
            toolCtx.put(AgentReActToolsFactory.CTX_INLINE_HERB_IMAGE_BASE64, herbImageBase64.trim());
            toolCtx.put(
                    AgentReActToolsFactory.CTX_INLINE_HERB_IMAGE_MIME,
                    StringUtils.hasText(herbImageMimeType) ? herbImageMimeType.trim() : "image/jpeg");
        }
        return new ReactToolBundle(toolCtx, kbSourcesAcc, litSourcesAcc);
    }

    /**
     * ChatClient + ToolCallbacks：在单请求内由模型多次发起 tool call，直至产出最终文本（Spring AI 内部驱动循环）。
     */
    private AgentRunResponse runTextWithReActTools(
            String task,
            Long knowledgeBaseId,
            Integer ragTopK,
            Double ragSimilarityThreshold,
            String herbImageBase64,
            String herbImageMimeType,
            String literatureCollectionId,
            Integer literatureRagTopK,
            Double literatureSimilarityThreshold,
            String textSystemBase) {

        ReactToolBundle bundle =
                buildReactToolBundle(
                        knowledgeBaseId,
                        ragTopK,
                        ragSimilarityThreshold,
                        literatureCollectionId,
                        literatureRagTopK,
                        literatureSimilarityThreshold,
                        herbImageBase64,
                        herbImageMimeType);

        String reactSystem = textSystemBase + "\n\n" + AgentPrompts.REACT_TOOLS_APPENDIX;

        ChatClient client =
                ChatClient.builder(textChatModel)
                        .defaultSystem(reactSystem)
                        .defaultToolCallbacks(agentReActToolsFactory.buildToolCallbacks())
                        .defaultToolContext(bundle.toolCtx())
                        .build();

        String answer = client.prompt().user(task).call().content();
        return new AgentRunResponse(
                answer,
                List.copyOf(bundle.kbSourcesAcc()),
                "react+tools",
                List.of(),
                List.copyOf(bundle.litSourcesAcc()));
    }

    /** 兼容旧版：在调用模型前由服务端完成一次知识库检索并拼入用户消息。 */
    private AgentRunResponse runLinearTextChat(
            String task,
            Long knowledgeBaseId,
            Integer ragTopK,
            Double ragSimilarityThreshold,
            String textSystem) {

        List<String> kbSources = new ArrayList<>();
        String augmented = task;

        if (knowledgeBaseId != null) {
            KnowledgeContextBundle ctx =
                    knowledgeRagService.retrieveContext(knowledgeBaseId, task, ragTopK, ragSimilarityThreshold);
            kbSources.addAll(ctx.sources());
            augmented =
                    "【知识库检索摘录】\n"
                            + ctx.contextText()
                            + "\n\n【用户任务】\n"
                            + task;
        }

        ChatClient textClient =
                ChatClient.builder(textChatModel).defaultSystem(textSystem).build();
        String answer = textClient.prompt().user(augmented).call().content();
        String mode = knowledgeBaseId != null ? "chat+kb" : "chat";
        return new AgentRunResponse(answer, List.copyOf(kbSources), mode, List.of());
    }

    private AgentRunResponse runVisionPath(
            String task,
            Long knowledgeBaseId,
            Integer ragTopK,
            Double ragSimilarityThreshold,
            List<MultipartFile> images,
            String visionSystem,
            String visionModel) {

        List<String> kbSources = new ArrayList<>();
        String augmented = task;

        if (knowledgeBaseId != null) {
            KnowledgeContextBundle ctx =
                    knowledgeRagService.retrieveContext(knowledgeBaseId, task, ragTopK, ragSimilarityThreshold);
            kbSources.addAll(ctx.sources());
            augmented =
                    "【知识库检索摘录】\n"
                            + ctx.contextText()
                            + "\n\n【用户任务】\n"
                            + task;
        }

        List<Media> medias = new ArrayList<>(images.size());
        for (MultipartFile image : images) {
            String mime =
                    image.getContentType() != null && !image.getContentType().isBlank()
                            ? image.getContentType()
                            : "image/jpeg";
            medias.add(
                    Media.builder()
                            .mimeType(MimeTypeUtils.parseMimeType(mime))
                            .data(image.getResource())
                            .build());
        }
        UserMessage message =
                UserMessage.builder().text(augmented).media(medias).build();

        ChatClient client =
                ChatClient.builder(visionChatModel).defaultSystem(visionSystem).build();
        OpenAiChatOptions visionOpts = OpenAiChatOptions.builder().model(visionModel).build();
        String answer = client.prompt().options(visionOpts).messages(message).call().content();
        String mode = knowledgeBaseId != null ? "vision+kb" : "vision";
        return new AgentRunResponse(answer, List.copyOf(kbSources), mode, List.of());
    }
}

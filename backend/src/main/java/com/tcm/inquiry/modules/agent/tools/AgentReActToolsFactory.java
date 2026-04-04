package com.tcm.inquiry.modules.agent.tools;

import java.util.Base64;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ToolContext;
import org.springframework.ai.content.Media;
import org.springframework.ai.ollama.api.OllamaOptions;
import org.springframework.ai.tool.ToolCallback;
import org.springframework.ai.tool.function.FunctionToolCallback;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.stereotype.Component;
import org.springframework.util.MimeTypeUtils;
import org.springframework.util.StringUtils;

import com.tcm.inquiry.config.AiConfig;
import com.tcm.inquiry.modules.agent.ai.AgentPrompts;
import com.tcm.inquiry.modules.agent.service.AgentAppConfigService;
import com.tcm.inquiry.modules.knowledge.ai.KnowledgeContextBundle;
import com.tcm.inquiry.modules.knowledge.ai.KnowledgeRagService;

/**
 * 智能体可调用工具的工厂：封装模块二向量检索与「视觉 / Mock」药材识别，供 {@link
 * org.springframework.ai.chat.client.ChatClient} 在单轮或多轮工具循环中调用。
 */
@Component
public class AgentReActToolsFactory {

    private static final Logger log = LoggerFactory.getLogger(AgentReActToolsFactory.class);

    private static final String TOOL_KNOWLEDGE = "knowledge_retrieval_tool";
    private static final String TOOL_HERB_IMAGE = "herb_image_recognition_tool";

    /** 放入 ToolContext：累积知识库来源，最终在 HTTP 响应中返回给前端 */
    public static final String CTX_KNOWLEDGE_SOURCES_COLLECTOR = "knowledgeSourcesCollector";

    public static final String CTX_DEFAULT_KNOWLEDGE_BASE_ID = "defaultKnowledgeBaseId";
    public static final String CTX_DEFAULT_RAG_TOP_K = "defaultRagTopK";
    public static final String CTX_DEFAULT_RAG_SIMILARITY = "defaultRagSimilarityThreshold";

    public static final String CTX_INLINE_HERB_IMAGE_BASE64 = "inlineHerbImageBase64";
    public static final String CTX_INLINE_HERB_IMAGE_MIME = "inlineHerbImageMimeType";

    private final KnowledgeRagService knowledgeRagService;
    private final ChatModel visionChatModel;
    private final AgentAppConfigService agentAppConfigService;
    private final String fallbackVisionModelName;

    private final ToolCallback knowledgeRetrievalTool;
    private final ToolCallback herbImageRecognitionTool;

    public AgentReActToolsFactory(
            KnowledgeRagService knowledgeRagService,
            @Qualifier(AiConfig.VISION_CHAT_MODEL) ChatModel visionChatModel,
            AgentAppConfigService agentAppConfigService,
            @Value("${tcm.ollama.vision-model:qwen3-vl:2b}") String fallbackVisionModelName) {
        this.knowledgeRagService = knowledgeRagService;
        this.visionChatModel = visionChatModel;
        this.agentAppConfigService = agentAppConfigService;
        this.fallbackVisionModelName = fallbackVisionModelName;
        this.knowledgeRetrievalTool = buildKnowledgeRetrievalTool();
        this.herbImageRecognitionTool = buildHerbImageRecognitionTool();
    }

    public List<ToolCallback> buildToolCallbacks() {
        return List.of(knowledgeRetrievalTool, herbImageRecognitionTool);
    }

    private ToolCallback buildKnowledgeRetrievalTool() {
        return FunctionToolCallback.builder(
                        TOOL_KNOWLEDGE,
                        (KnowledgeRetrievalToolArgs args, ToolContext ctx) -> {
                            try {
                                Long kbId = resolveKnowledgeBaseId(args, ctx);
                                if (kbId == null) {
                                    return "【工具结果-错误】未解析到 knowledge_base_id：请在参数中显式传入，或由管理员在「智能体配置」中设置默认知识库。";
                                }
                                if (args.query() == null || args.query().isBlank()) {
                                    return "【工具结果-错误】query 不能为空。";
                                }

                                Integer topK = resolveTopK(args, ctx);
                                Double sim = resolveSimilarity(args, ctx);

                                KnowledgeContextBundle bundle =
                                        knowledgeRagService.retrieveContext(
                                                kbId, args.query().trim(), topK, sim);

                                @SuppressWarnings("unchecked")
                                List<String> collector =
                                        ctx.getContext() == null
                                                ? null
                                                : (List<String>)
                                                        ctx.getContext()
                                                                .get(CTX_KNOWLEDGE_SOURCES_COLLECTOR);
                                if (collector != null) {
                                    collector.addAll(bundle.sources());
                                }

                                // 将检索结果格式化为模型易于消费的「观察」文本（Observation）
                                return formatKnowledgeToolObservation(bundle);
                            } catch (Exception ex) {
                                log.warn("knowledge_retrieval_tool 执行失败", ex);
                                return "【工具结果-异常】"
                                        + (ex.getMessage() != null ? ex.getMessage() : ex.getClass().getSimpleName());
                            }
                        })
                .description(
                        """
                        从企业「中医药持久化知识库」中做向量相似度检索。根据 query 召回 topK 条文本片段及来源文件名，\
                        供辨证与方剂建议引用。knowledge_base_id 可省略：此时使用会话默认知识库（若已配置）。\
                        """)
                .inputType(KnowledgeRetrievalToolArgs.class)
                .build();
    }

    private static String formatKnowledgeToolObservation(KnowledgeContextBundle bundle) {
        String src =
                bundle.sources().isEmpty()
                        ? "（无显式来源元数据）"
                        : String.join("、", bundle.sources());
        return """
                【知识库检索-Observation】命中片段数：%d；来源：%s。

                ——摘录正文（可直接引用，勿编造未出现事实）——
                %s
                """
                .formatted(bundle.retrievedChunks(), src, bundle.contextText());
    }

    private static Long resolveKnowledgeBaseId(KnowledgeRetrievalToolArgs args, ToolContext ctx) {
        if (args.knowledgeBaseId() != null) {
            return args.knowledgeBaseId();
        }
        Map<String, Object> m = ctx.getContext();
        if (m == null) {
            return null;
        }
        Object v = m.get(CTX_DEFAULT_KNOWLEDGE_BASE_ID);
        if (v instanceof Number n) {
            return n.longValue();
        }
        return null;
    }

    private static Integer resolveTopK(KnowledgeRetrievalToolArgs args, ToolContext ctx) {
        if (args.topK() != null) {
            return args.topK();
        }
        Map<String, Object> m = ctx.getContext();
        if (m == null) {
            return null;
        }
        Object v = m.get(CTX_DEFAULT_RAG_TOP_K);
        if (v instanceof Number n) {
            return n.intValue();
        }
        return null;
    }

    private static Double resolveSimilarity(KnowledgeRetrievalToolArgs args, ToolContext ctx) {
        if (args.similarityThreshold() != null) {
            return args.similarityThreshold();
        }
        Map<String, Object> m = ctx.getContext();
        if (m == null) {
            return null;
        }
        Object v = m.get(CTX_DEFAULT_RAG_SIMILARITY);
        if (v instanceof Number n) {
            return n.doubleValue();
        }
        return null;
    }

    private ToolCallback buildHerbImageRecognitionTool() {
        return FunctionToolCallback.builder(
                        TOOL_HERB_IMAGE,
                        (HerbImageRecognitionToolArgs args, ToolContext ctx) -> {
                            try {
                                String b64 = firstNonBlank(args.imageBase64(), ctxString(ctx, CTX_INLINE_HERB_IMAGE_BASE64));
                                String mime =
                                        firstNonBlank(
                                                args.mimeType(), ctxString(ctx, CTX_INLINE_HERB_IMAGE_MIME));
                                String desc = args.textualDescription() != null ? args.textualDescription().trim() : "";

                                if (!StringUtils.hasText(b64)) {
                                    // 无图：返回可继续 ReAct 的 Observation，避免空指针；必要时由模型追问用户
                                    if (StringUtils.hasText(desc)) {
                                        return """
                                                【图像识别-Observation】未接收到 Base64 图像，仅获得文字描述：「%s」。

                                                （说明：当前为无图模式，结论可靠性有限；建议用户上传舌象/饮片照片后再次调用本工具，或改用 knowledge_retrieval_tool 查阅文献。）
                                                """
                                                .formatted(desc);
                                    }
                                    return """
                                            【图像识别-Observation】未提供 image_base64，且无文字描述。

                                            请提示用户上传药材/饮片照片（可将图像 Base64 传入本工具），或至少给出外形、色泽、气味等 textual_description。
                                            """;
                                }

                                byte[] raw;
                                try {
                                    raw = Base64.getDecoder().decode(b64.trim());
                                } catch (IllegalArgumentException e) {
                                    log.debug("herb_image_recognition_tool Base64 解码失败", e);
                                    return "【图像识别-错误】image_base64 不是合法的 Base64。";
                                }

                                var appCfg = agentAppConfigService.getOrCreateEntity();
                                String visionSys =
                                        StringUtils.hasText(appCfg.getVisionSystemPrompt())
                                                ? appCfg.getVisionSystemPrompt()
                                                : AgentPrompts.VISION_SYSTEM;
                                String visionModel =
                                        StringUtils.hasText(appCfg.getVisionModelName())
                                                ? appCfg.getVisionModelName().trim()
                                                : fallbackVisionModelName;

                                String mimeResolved =
                                        StringUtils.hasText(mime) ? mime.trim() : "image/jpeg";
                                Media media =
                                        Media.builder()
                                                .mimeType(MimeTypeUtils.parseMimeType(mimeResolved))
                                                .data(new ByteArrayResource(raw))
                                                .build();

                                String userLine =
                                        """
                                        请识别图中的中药材或饮片。用户补充说明：%s
                                        """
                                                .formatted(
                                                        StringUtils.hasText(desc) ? desc : "（无）");

                                UserMessage um =
                                        UserMessage.builder().text(userLine).media(media).build();

                                ChatClient client =
                                        ChatClient.builder(visionChatModel)
                                                .defaultSystem(visionSys)
                                                .build();

                                // 显式指定视觉模型名，避免与文本主模型混淆（与既有 Agent 多模态路径一致）
                                OllamaOptions opts = OllamaOptions.builder().model(visionModel).build();
                                String answer =
                                        client.prompt().options(opts).messages(um).call().content();

                                return "【图像识别-Observation】\n" + answer;
                            } catch (Exception ex) {
                                log.warn("herb_image_recognition_tool 执行失败", ex);
                                return "【图像识别-异常】"
                                        + (ex.getMessage() != null ? ex.getMessage() : ex.getClass().getSimpleName());
                            }
                        })
                .description(
                        """
                        中药材/饮片图像识别：传入 image_base64 与 mime_type（如 image/jpeg），可选 textual_description。

                        将调用本地 Ollama 视觉模型给出形态特征与鉴别要点。若无图，可仅传描述，工具会返回有限说明并引导补图。
                        """)
                .inputType(HerbImageRecognitionToolArgs.class)
                .build();
    }

    private static String ctxString(ToolContext ctx, String key) {
        if (ctx.getContext() == null) {
            return null;
        }
        Object v = ctx.getContext().get(key);
        return v != null ? v.toString() : null;
    }

    private static String firstNonBlank(String a, String b) {
        if (StringUtils.hasText(a)) {
            return a;
        }
        if (StringUtils.hasText(b)) {
            return b;
        }
        return null;
    }
}

package com.tcm.inquiry.modules.agent.tools;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ToolContext;
import org.springframework.ai.tool.ToolCallback;

import com.tcm.inquiry.modules.agent.entity.AgentAppConfig;
import com.tcm.inquiry.modules.agent.service.AgentAppConfigService;
import com.tcm.inquiry.modules.knowledge.ai.KnowledgeContextBundle;
import com.tcm.inquiry.modules.knowledge.ai.KnowledgeRagService;

class AgentReActToolsFactoryTest {

    private KnowledgeRagService rag;
    private ChatModel vision;
    private AgentAppConfigService cfgSvc;
    private AgentReActToolsFactory factory;

    @BeforeEach
    void setUp() {
        rag = mock(KnowledgeRagService.class);
        vision = mock(ChatModel.class);
        cfgSvc = mock(AgentAppConfigService.class);
        AgentAppConfig cfg = new AgentAppConfig();
        cfg.setVisionModelName("mock-vl");
        cfg.setVisionSystemPrompt(null);
        when(cfgSvc.getOrCreateEntity()).thenReturn(cfg);
        factory = new AgentReActToolsFactory(rag, vision, cfgSvc, "fallback-vl");
    }

    private static ToolCallback find(List<ToolCallback> callbacks, String name) {
        for (ToolCallback c : callbacks) {
            if (name.equals(c.getToolDefinition().name())) {
                return c;
            }
        }
        throw new AssertionError("tool not found: " + name);
    }

    @Test
    void knowledgeRetrievalToolUsesDefaultKbFromContextAndFillsCollector() throws Exception {
        when(rag.retrieveContext(eq(7L), eq("咳嗽"), isNull(), isNull()))
                .thenReturn(new KnowledgeContextBundle("ctx-body", List.of("a.pdf"), 2));

        ToolCallback cb = find(factory.buildToolCallbacks(), "knowledge_retrieval_tool");

        List<String> coll = new ArrayList<>();
        ToolContext tcx =
                new ToolContext(
                        Map.of(
                                AgentReActToolsFactory.CTX_KNOWLEDGE_SOURCES_COLLECTOR,
                                coll,
                                AgentReActToolsFactory.CTX_DEFAULT_KNOWLEDGE_BASE_ID,
                                7L));

        String json = "{\"query\":\"咳嗽\"}";
        String out = cb.call(json, tcx);

        assertThat(out).contains("ctx-body");
        assertThat(out).contains("a.pdf");
        assertThat(coll).containsExactly("a.pdf");
    }

    @Test
    void knowledgeRetrievalToolReturnsErrorWhenKbUnresolved() throws Exception {
        ToolCallback cb = find(factory.buildToolCallbacks(), "knowledge_retrieval_tool");
        ToolContext tcx = new ToolContext(Map.of(AgentReActToolsFactory.CTX_KNOWLEDGE_SOURCES_COLLECTOR, new ArrayList<String>()));
        String out = cb.call("{\"query\":\"x\"}", tcx);
        assertThat(out).contains("未解析到 knowledge_base_id");
    }

    @Test
    void herbImageRecognitionToolWithoutImageReturnsObservationHint() throws Exception {
        ToolCallback cb = find(factory.buildToolCallbacks(), "herb_image_recognition_tool");
        String out = cb.call("{}", new ToolContext(Map.of()));
        assertThat(out).contains("未提供");
    }
}

package com.tcm.inquiry.modules.agent;

import java.util.List;

import com.tcm.inquiry.modules.knowledge.dto.resp.KnowledgeRetrievedPassage;

/**
 * {@code mode}：{@code chat} 纯线性 | {@code react+tools} ReAct 工具编排 | {@code vision} /
 * {@code chat+kb} 等沿用旧版前缀；{@code knowledgeSources} 为知识库来源文件名集合（预注入或工具累积）。
 */
public record AgentRunResponse(
        String assistant,
        List<String> knowledgeSources,
        String mode,
        List<String> toolCallSummaries,
        /** 文献检索工具累计的来源文件名（持久化知识库来源见 knowledgeSources） */
        List<String> literatureSources,
        /** 本轮 ReAct 工具链合并后的溯源摘录（Top-N 已在外层 finalize） */
        List<KnowledgeRetrievedPassage> retrievalPassages) {

    public AgentRunResponse(String assistant, List<String> knowledgeSources, String mode) {
        this(assistant, knowledgeSources, mode, List.of(), List.of(), List.of());
    }

    public AgentRunResponse(
            String assistant, List<String> knowledgeSources, String mode, List<String> toolCallSummaries) {
        this(assistant, knowledgeSources, mode, toolCallSummaries, List.of(), List.of());
    }

    public AgentRunResponse(
            String assistant,
            List<String> knowledgeSources,
            String mode,
            List<String> toolCallSummaries,
            List<String> literatureSources) {
        this(assistant, knowledgeSources, mode, toolCallSummaries, literatureSources, List.of());
    }

    public static AgentRunResponse chatOnly(String text) {
        return new AgentRunResponse(text, List.of(), "chat");
    }
}

package com.tcm.inquiry.modules.agent;

import java.util.List;

/**
 * {@code mode}：{@code chat} 纯线性 | {@code react+tools} ReAct 工具编排 | {@code vision} /
 * {@code chat+kb} 等沿用旧版前缀；{@code knowledgeSources} 为知识库来源文件名集合（预注入或工具累积）。
 */
public record AgentRunResponse(
        String assistant, List<String> knowledgeSources, String mode, List<String> toolCallSummaries) {

    public AgentRunResponse(String assistant, List<String> knowledgeSources, String mode) {
        this(assistant, knowledgeSources, mode, List.of());
    }

    public static AgentRunResponse chatOnly(String text) {
        return new AgentRunResponse(text, List.of(), "chat");
    }
}

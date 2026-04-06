package com.tcm.inquiry.modules.agent;

/**
 * 问诊 SSE 侧观察 ReAct 工具执行（对齐 claw-code {@code AssistantEvent::ToolUse} 的可观测性），
 * 由 {@link com.tcm.inquiry.modules.agent.tools.AgentReActToolsFactory} 在工具起止时回调。
 *
 * @param toolName 工具名，如 {@code knowledge_retrieval_tool}
 * @param phase {@code start} / {@code end}
 * @param detail 可选摘要（如检索 query 截断），{@code end} 时通常为空
 */
@FunctionalInterface
public interface ConsultationToolProgressNotifier {

    void onToolProgress(String toolName, String phase, String detail);
}

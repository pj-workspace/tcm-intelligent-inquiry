"""内部信号工具：仅深度思考模式注入；不进 tool_registry、不对用户可见。

设计要点：
- 名称固定为 ``MARK_SUMMARY_TOOL_NAME``（与 stream_chat / 前端 useChatStream 共享）。
- ``stream_chat`` 在 ``on_tool_start`` 时识别此工具，**短路** SSE 事件：
  转而向前端发送 ``summary-start`` 信号，让前端从"trace 阶段"切到"最终答案阶段"。
- 工具本身不参与持久化（``on_tool_end`` 也被短路），用户在前端看不到此调用。
- 仅在 ``backend.app.agent.executor._build_ephemeral_agent_graph`` 内当
  ``effective_deep_think=True`` 时显式追加；非 think 模式下模型物理上看不到此工具。
"""

from __future__ import annotations

from langchain_core.tools import tool

__all__ = ["MARK_SUMMARY_TOOL_NAME", "mark_summary_tool"]

#: 与 stream_chat / 前端约定的工具名，请勿修改字符串字面量。
MARK_SUMMARY_TOOL_NAME = "mark_summary"


@tool
async def mark_summary() -> str:
    """在即将输出最终答案前调用此工具（无参数）。

    调用此工具后请**紧接着**写最终答案正文，不要再调用任何其他工具，
    也不要输出额外说明性话术。这是一个内部边界信号，用户不会看到此调用。
    """
    return ""


#: 单例工具实例；executor 直接附加到 tools 列表
mark_summary_tool = mark_summary

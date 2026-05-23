"""内部信号工具：仅深度思考模式注入；不进 tool_registry、不对用户可见。

设计要点：
- 名称固定为 ``MARK_SUMMARY_TOOL_NAME``（与 stream_chat / 前端 useChatStream 共享）。
- ``stream_chat`` 在 ``on_tool_start`` 时识别此工具，**短路** SSE 事件：
  转而向前端发送 ``summary-start`` 信号，让前端从"trace 阶段"切到"最终答案阶段"。
- 工具本身不参与持久化（``on_tool_end`` 也被短路），用户在前端看不到此调用。
- 仅在 ``backend.app.agent.executor._build_ephemeral_agent_graph`` 内当
  ``effective_deep_think=True`` 时显式追加；非 think 模式下模型物理上看不到此工具。

零参数设计：
- 之前为了对 function calling 较弱的模型加保险，曾让 mark_summary 必填一个
  ``answer_outline`` 字段。但这要求模型先生成一段 outline 文本，**显著拖慢**了
  最终答案的首字延迟。
- DeepSeek-V4-flash 及大多数主流模型的 function calling 已经足够稳定，零参数
  不会出现"工具名被当字面文本输出"的问题。如果未来切换到弱模型再翻车，可以
  把 outline 字段加回来。
"""

from __future__ import annotations

from langchain_core.tools import tool

__all__ = ["MARK_SUMMARY_TOOL_NAME", "mark_summary_tool"]

#: 与 stream_chat / 前端约定的工具名，请勿修改字符串字面量。
MARK_SUMMARY_TOOL_NAME = "mark_summary"


@tool
async def mark_summary() -> str:
    """Internal boundary signal for deep-think mode. Call exactly once immediately before the final answer.

    No arguments. The user never sees this tool call. This tool is not a
    knowledge source and does not produce content; it only tells the product UI
    that the trace/thinking phase is complete and the final answer is starting.

    Use it:
    - after all required business tools have completed and you are ready to
      write the first user-visible final answer token;
    - even if no business tool was needed in this turn.

    Do not use it:
    - before calling ask_user; if ask_user is needed, ask the user and stop;
    - while another business tool is still needed;
    - more than once in the same turn.

    After calling this tool, immediately write the final answer as plain text.
    Do not call any other tool, do not emit reasoning content, and do not write
    transitional phrases like "好的，现在我来回答".
    """
    # 后端短路：on_tool_start 时已发 summary-start 信号；此函数体不会被实际执行。
    # 兜底返回空字符串，保证 ReAct 路径若意外走到这里也不会崩。
    return ""


#: 单例工具实例；executor 直接附加到 tools 列表
mark_summary_tool = mark_summary

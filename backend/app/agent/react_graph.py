"""LangGraph ReAct Agent 图构建（统一 version 配置）。"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from langchain_core.language_models import LanguageModelLike
from langchain_core.tools import BaseTool
from langgraph.graph.state import CompiledStateGraph
from langgraph.prebuilt import create_react_agent

from app.agent.tools.timeout_wrapper import apply_default_tool_timeout

# v2 对每个 tool_call 发 Send，单个工具返回后会立刻回到 agent，
# 并行调用时易出现「AIMessage.tool_calls 尚未全部有 ToolMessage」的 INVALID_CHAT_HISTORY。
# v1 一次进入 tools 节点并 gather 全部调用，再回 agent。
REACT_AGENT_GRAPH_VERSION = "v1"


def build_react_agent_graph(
    llm: LanguageModelLike,
    tools: Sequence[BaseTool | dict[str, Any]],
    *,
    prompt: str | None = None,
) -> CompiledStateGraph:
    """构建 ReAct 图。

    所有可调用工具会被统一包装默认超时（30s），避免某个工具长时间阻塞导致整体挂死。
    """
    base_tools = [t for t in tools if isinstance(t, BaseTool)]
    other_tools = [t for t in tools if not isinstance(t, BaseTool)]
    bounded = apply_default_tool_timeout(base_tools)
    final_tools: list[BaseTool | dict[str, Any]] = [*bounded, *other_tools]
    return create_react_agent(
        llm,
        final_tools,
        prompt=prompt,
        version=REACT_AGENT_GRAPH_VERSION,
    )

"""Agent 运行时：基于 LangGraph create_react_agent 构建 ReAct 图。

当前支持"默认 Agent"，后续可根据 agent_id 从数据库加载配置，
动态组装工具集与系统提示。
"""

from functools import lru_cache

from langgraph.graph.state import CompiledStateGraph
from langgraph.prebuilt import create_react_agent

from app.agent.tools.loader import ensure_tools_loaded
from app.agent.tools.registry import tool_registry
from app.core.logging import get_logger
from app.llm.registry import get_chat_model

logger = get_logger(__name__)

_DEFAULT_SYSTEM_PROMPT = """\
你是面向中医领域的智能助手，回答需严谨、可引用知识库检索结果。
- 若需要文献支撑，请先调用 search_tcm_knowledge 工具检索知识库。
- 若需要查询具体方剂，请调用 formula_lookup 工具。
- 在工具结果的基础上综合推理，再给出最终答案。\
"""


def _load_tools():
    ensure_tools_loaded()
    return tool_registry.all()


@lru_cache
def get_agent(agent_id: str | None = None) -> CompiledStateGraph:
    """返回 LangGraph ReAct Agent。

    agent_id=None 时返回默认 Agent；
    后续可扩展为按 ID 从数据库加载配置（工具集、系统提示、模型等）。
    """
    if agent_id is not None:
        logger.info("agent_id=%s: 自定义 Agent 暂未实现，使用默认 Agent", agent_id)

    llm = get_chat_model()
    tools = _load_tools()
    logger.info("创建 ReAct Agent，工具集: %s", [t.name for t in tools])

    return create_react_agent(llm, tools, prompt=_DEFAULT_SYSTEM_PROMPT)

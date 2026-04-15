"""Agent 运行时：基于 LangGraph create_react_agent 构建 ReAct 图。

- agent_id 为空：使用默认工具集与默认系统提示（进程内缓存）。
- agent_id 非空：从数据库加载 AgentRecord，按配置组装工具与提示。
"""

from functools import lru_cache

from langgraph.graph.state import CompiledStateGraph
from langgraph.prebuilt import create_react_agent

from app.agent.tools.loader import ensure_tools_loaded
from app.agent.tools.registry import tool_registry
from app.core.database import async_session_factory
from app.core.logging import get_logger
from app.llm.registry import get_chat_model

logger = get_logger(__name__)

_DEFAULT_SYSTEM_PROMPT = """\
你是面向中医领域的智能助手，回答需严谨、可引用知识库检索结果。
- 若需要文献支撑，请先调用 search_tcm_knowledge 工具检索知识库。
- 若需要查询具体方剂，请调用 formula_lookup 工具。
- 在工具结果的基础上综合推理，再给出最终答案。\
"""


def _load_all_tools():
    ensure_tools_loaded()
    return tool_registry.all()


@lru_cache(maxsize=1)
def get_default_graph() -> CompiledStateGraph:
    llm = get_chat_model()
    tools = _load_all_tools()
    logger.info("创建默认 ReAct Agent，工具: %s", [t.name for t in tools])
    return create_react_agent(llm, tools, prompt=_DEFAULT_SYSTEM_PROMPT)


async def build_agent_graph(agent_id: str | None) -> CompiledStateGraph:
    """构建 LangGraph Agent；无 agent_id 时返回缓存的默认图。"""
    if not agent_id:
        return get_default_graph()

    from app.agent.models import AgentRecord

    async with async_session_factory() as session:
        row = await session.get(AgentRecord, agent_id)
        if row is None:
            logger.warning("Agent id=%s 不存在，回退默认 Agent", agent_id)
            return get_default_graph()

        ensure_tools_loaded()
        names = row.tool_names or []
        if names:
            tools = tool_registry.get(names)
            if len(tools) != len(names):
                found = {t.name for t in tools}
                missing = [n for n in names if n not in found]
                logger.warning("Agent 工具部分缺失，已忽略: %s", missing)
        else:
            tools = tool_registry.all()

        if not tools:
            tools = tool_registry.all()

        llm = get_chat_model()
        prompt = (row.system_prompt or "").strip() or _DEFAULT_SYSTEM_PROMPT
        logger.info(
            "创建 Agent id=%s name=%s tools=%s",
            row.id,
            row.name,
            [t.name for t in tools],
        )
        return create_react_agent(llm, tools, prompt=prompt)

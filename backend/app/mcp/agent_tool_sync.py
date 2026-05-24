"""MCP 工具变更时同步 Agent 的 tool_names 绑定。"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.executor import invalidate_agent_graph_cache
from app.agent.models import AgentRecord
from app.core.logging import get_logger

logger = get_logger(__name__)


async def prune_removed_tools_from_agents(
    session: AsyncSession,
    removed_lc_names: set[str] | list[str],
) -> list[str]:
    """从所有 Agent 的 tool_names 中移除已卸载的 MCP LangChain 工具名。"""
    removed = set(removed_lc_names)
    if not removed:
        return []

    r = await session.execute(select(AgentRecord))
    affected: list[str] = []
    for agent in r.scalars():
        old = agent.tool_names if isinstance(agent.tool_names, list) else []
        new = [n for n in old if n not in removed]
        if len(new) == len(old):
            continue
        agent.tool_names = new
        affected.append(agent.id)
        invalidate_agent_graph_cache(agent.id)

    if affected:
        logger.info(
            "已从 Agent 移除失效 MCP 工具 agents=%s removed=%s",
            affected,
            sorted(removed),
        )
    return affected

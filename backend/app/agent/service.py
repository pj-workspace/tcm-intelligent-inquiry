"""Agent 管理服务：配置持久化到 PostgreSQL。"""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.models import AgentRecord
from app.agent.schemas import AgentCreateRequest, AgentListResponse, AgentResponse
from app.agent.tools.loader import ensure_tools_loaded
from app.agent.tools.registry import tool_registry
from app.core.exceptions import NotFoundError
from app.core.logging import get_logger

logger = get_logger(__name__)


def _to_response(row: AgentRecord) -> AgentResponse:
    names = row.tool_names if isinstance(row.tool_names, list) else []
    return AgentResponse(
        id=row.id,
        name=row.name,
        description=row.description or "",
        tool_names=[str(x) for x in names],
        system_prompt=row.system_prompt or "",
    )


class AgentService:
    def __init__(self, session: AsyncSession):
        self._session = session

    async def list_agents(self) -> AgentListResponse:
        r = await self._session.execute(select(AgentRecord).order_by(AgentRecord.name))
        rows = r.scalars().all()
        return AgentListResponse(agents=[_to_response(x) for x in rows], total=len(rows))

    async def get_agent(self, agent_id: str) -> AgentResponse:
        row = await self._session.get(AgentRecord, agent_id)
        if row is None:
            raise NotFoundError(f"Agent '{agent_id}' 不存在")
        return _to_response(row)

    async def create_agent(self, req: AgentCreateRequest) -> AgentResponse:
        ensure_tools_loaded()
        available = set(tool_registry.names())
        names = req.tool_names or []
        if names:
            unknown = [n for n in names if n not in available]
            if unknown:
                from app.core.exceptions import ValidationError

                raise ValidationError(f"未知工具: {unknown}，可用工具: {sorted(available)}")

        agent_id = str(uuid.uuid4())
        tool_list = names if names else sorted(available)
        row = AgentRecord(
            id=agent_id,
            name=req.name,
            description=req.description or "",
            tool_names=tool_list,
            system_prompt=req.system_prompt or "",
        )
        self._session.add(row)
        await self._session.flush()
        logger.info("创建 Agent id=%s name=%s tools=%s", agent_id, req.name, tool_list)
        return _to_response(row)

    async def delete_agent(self, agent_id: str) -> None:
        row = await self._session.get(AgentRecord, agent_id)
        if row is None:
            raise NotFoundError(f"Agent '{agent_id}' 不存在")
        self._session.delete(row)
        logger.info("删除 Agent id=%s", agent_id)

    async def list_available_tools(self) -> list[str]:
        ensure_tools_loaded()
        return tool_registry.names()

"""Agent 管理服务：创建、查询、删除 Agent 配置。

当前为内存存储骨架；后续替换为数据库持久化（SQLAlchemy + PostgreSQL）。
"""

import uuid

from app.agent.schemas import AgentCreateRequest, AgentListResponse, AgentResponse
from app.agent.tools.loader import ensure_tools_loaded
from app.agent.tools.registry import tool_registry
from app.core.exceptions import NotFoundError
from app.core.logging import get_logger

logger = get_logger(__name__)

_store: dict[str, AgentResponse] = {}


class AgentService:
    def list_agents(self) -> AgentListResponse:
        agents = list(_store.values())
        return AgentListResponse(agents=agents, total=len(agents))

    def get_agent(self, agent_id: str) -> AgentResponse:
        if agent_id not in _store:
            raise NotFoundError(f"Agent '{agent_id}' 不存在")
        return _store[agent_id]

    def create_agent(self, req: AgentCreateRequest) -> AgentResponse:
        ensure_tools_loaded()
        available = tool_registry.names()
        unknown = [t for t in req.tool_names if t not in available]
        if unknown:
            from app.core.exceptions import ValidationError

            raise ValidationError(f"未知工具: {unknown}，可用工具: {available}")

        agent_id = str(uuid.uuid4())
        resp = AgentResponse(
            id=agent_id,
            name=req.name,
            description=req.description,
            tool_names=req.tool_names or available,
        )
        _store[agent_id] = resp
        logger.info("创建 Agent id=%s name=%s", agent_id, req.name)
        return resp

    def delete_agent(self, agent_id: str) -> None:
        if agent_id not in _store:
            raise NotFoundError(f"Agent '{agent_id}' 不存在")
        del _store[agent_id]
        logger.info("删除 Agent id=%s", agent_id)

    def list_available_tools(self) -> list[str]:
        ensure_tools_loaded()
        return tool_registry.names()

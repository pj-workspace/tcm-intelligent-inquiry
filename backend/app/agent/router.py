"""Agent 管理路由。

提供 Agent 的增删查接口，以及可用工具列表查询。
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.schemas import AgentCreateRequest, AgentListResponse, AgentResponse
from app.agent.service import AgentService
from app.core.database import get_session

router = APIRouter(prefix="/api/agents", tags=["agents"])


def _svc(session: AsyncSession = Depends(get_session)) -> AgentService:
    return AgentService(session)


@router.get("", response_model=AgentListResponse, summary="列出所有 Agent")
async def list_agents(svc: AgentService = Depends(_svc)):
    return await svc.list_agents()


@router.post("", response_model=AgentResponse, summary="创建 Agent")
async def create_agent(req: AgentCreateRequest, svc: AgentService = Depends(_svc)):
    return await svc.create_agent(req)


@router.get("/tools", summary="列出所有可用工具")
async def list_tools(svc: AgentService = Depends(_svc)):
    return {"tools": await svc.list_available_tools()}


@router.get("/{agent_id}", response_model=AgentResponse, summary="获取 Agent 详情")
async def get_agent(agent_id: str, svc: AgentService = Depends(_svc)):
    return await svc.get_agent(agent_id)


@router.delete("/{agent_id}", status_code=204, summary="删除 Agent")
async def delete_agent(agent_id: str, svc: AgentService = Depends(_svc)):
    await svc.delete_agent(agent_id)

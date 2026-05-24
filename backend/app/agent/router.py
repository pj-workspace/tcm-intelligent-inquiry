"""Agent 管理路由。

提供 Agent 的增删查接口，以及可用工具列表查询。
"""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.schemas import (
    AgentCreateRequest,
    AgentListResponse,
    AgentResponse,
    AgentUpdateRequest,
    GenerateSystemPromptRequest,
    GenerateSystemPromptResponse,
    ToolInvokeRequest,
    ToolInvokeResponse,
    ToolListResponse,
)
from app.agent.service import AgentService
from app.auth.api.deps import require_api_user
from app.auth.models import UserRecord
from app.core.database import get_session

router = APIRouter(prefix="/api/agents", tags=["agents"])


def _svc(session: AsyncSession = Depends(get_session)) -> AgentService:
    """FastAPI 依赖：构造带会话的 AgentService。"""
    return AgentService(session)


@router.get("", response_model=AgentListResponse, summary="列出所有 Agent")
async def list_agents(
    _: Annotated[UserRecord, Depends(require_api_user)],
    svc: AgentService = Depends(_svc),
):
    """GET /api/agents — 列出所有 Agent。"""
    return await svc.list_agents()


@router.post("", response_model=AgentResponse, summary="创建 Agent")
async def create_agent(
    req: AgentCreateRequest,
    user: Annotated[UserRecord, Depends(require_api_user)],
    svc: AgentService = Depends(_svc),
):
    """POST /api/agents — 创建 Agent。"""
    return await svc.create_agent(req, user.id)


@router.get("/tools", response_model=ToolListResponse, summary="列出所有可用工具（结构化）")
async def list_tools(
    _: Annotated[UserRecord, Depends(require_api_user)],
    svc: AgentService = Depends(_svc),
):
    """GET /api/agents/tools — 列出可用工具及参数 schema。"""
    return await svc.list_available_tools()


@router.post(
    "/tools/{tool_name}/invoke",
    response_model=ToolInvokeResponse,
    summary="在线试用内置工具",
)
async def invoke_tool(
    tool_name: str,
    req: ToolInvokeRequest,
    user: Annotated[UserRecord, Depends(require_api_user)],
    svc: AgentService = Depends(_svc),
):
    """POST /api/agents/tools/{tool_name}/invoke — 在线试用工具。"""
    return await svc.invoke_tool(tool_name, req.args, user.id)


@router.post(
    "/generate-system-prompt",
    response_model=GenerateSystemPromptResponse,
    summary="AI 生成 Agent 系统提示词并推荐工具",
)
async def generate_system_prompt(
    req: GenerateSystemPromptRequest,
    user: Annotated[UserRecord, Depends(require_api_user)],
    svc: AgentService = Depends(_svc),
):
    """POST /api/agents/generate-system-prompt — 根据名称/说明生成 XML prompt。"""
    return await svc.generate_system_prompt(req, user.id)


@router.get("/{agent_id}", response_model=AgentResponse, summary="获取 Agent 详情")
async def get_agent(
    agent_id: str,
    _: Annotated[UserRecord, Depends(require_api_user)],
    svc: AgentService = Depends(_svc),
):
    """GET /api/agents/{agent_id} — 获取 Agent 详情。"""
    return await svc.get_agent(agent_id)


@router.patch("/{agent_id}", response_model=AgentResponse, summary="更新 Agent 配置")
async def update_agent(
    agent_id: str,
    req: AgentUpdateRequest,
    user: Annotated[UserRecord, Depends(require_api_user)],
    svc: AgentService = Depends(_svc),
):
    """PATCH /api/agents/{agent_id} — 部分更新 Agent 配置。"""
    return await svc.update_agent(agent_id, req, user.id)


@router.delete("/{agent_id}", status_code=204, summary="删除 Agent")
async def delete_agent(
    agent_id: str,
    _: Annotated[UserRecord, Depends(require_api_user)],
    svc: AgentService = Depends(_svc),
):
    """DELETE /api/agents/{agent_id} — 删除 Agent。"""
    await svc.delete_agent(agent_id)

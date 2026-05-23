"""MCP 服务管理路由。"""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.api.deps import require_api_user
from app.auth.models import UserRecord
from app.core.database import get_session
from app.mcp.schemas import (
    McpImportRequest,
    McpImportResponse,
    McpServerCreateRequest,
    McpServerListResponse,
    McpServerResponse,
)
from app.mcp.services.mcp_service import McpService

router = APIRouter(prefix="/api/mcp", tags=["mcp"])


def _svc(session: AsyncSession = Depends(get_session)) -> McpService:
    """Internal helper: svc."""
    return McpService(session)


@router.get("", response_model=McpServerListResponse, summary="列出已注册 MCP 服务")
async def list_servers(
    _: Annotated[UserRecord, Depends(require_api_user)],
    svc: McpService = Depends(_svc),
):
    """List servers。"""
    return await svc.list_servers()


@router.post("", response_model=McpServerResponse, summary="注册 MCP 服务")
async def register_server(
    req: McpServerCreateRequest,
    _: Annotated[UserRecord, Depends(require_api_user)],
    svc: McpService = Depends(_svc),
):
    """Register server。"""
    return await svc.register_server(req)


@router.post(
    "/import",
    response_model=McpImportResponse,
    summary="批量导入 Cursor mcpServers 配置（支持 command 与 url）",
)
async def import_servers(
    req: McpImportRequest,
    _: Annotated[UserRecord, Depends(require_api_user)],
    svc: McpService = Depends(_svc),
):
    """Import servers。"""
    return await svc.import_cursor_config(req)


@router.get("/{server_id}", response_model=McpServerResponse, summary="获取 MCP 服务详情")
async def get_server(
    server_id: str,
    _: Annotated[UserRecord, Depends(require_api_user)],
    svc: McpService = Depends(_svc),
):
    """Get server。"""
    return await svc.get_server(server_id)


@router.post(
    "/{server_id}/refresh",
    response_model=McpServerResponse,
    summary="重新发现工具列表",
)
async def refresh_tools(
    server_id: str,
    _: Annotated[UserRecord, Depends(require_api_user)],
    svc: McpService = Depends(_svc),
):
    """Refresh tools。"""
    return await svc.refresh_tools(server_id)


@router.delete("/{server_id}", status_code=204, summary="删除 MCP 服务")
async def delete_server(
    server_id: str,
    _: Annotated[UserRecord, Depends(require_api_user)],
    svc: McpService = Depends(_svc),
):
    """Delete server。"""
    await svc.delete_server(server_id)

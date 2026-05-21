"""MCP 服务管理：注册、发现工具、动态挂载到 Agent 工具集（持久化 PostgreSQL）。"""

import asyncio
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.exceptions import NotFoundError, ValidationError
from app.core.logging import get_logger
from app.mcp.bridge.tool_bridge import register_mcp_tools_for_server, unregister_mcp_tools_for_server
from app.mcp.client.http import discover_tools as discover_tools_http
from app.mcp.client.stdio import discover_tools_stdio
from app.mcp.client.stdio_pool import stdio_pool
from app.mcp.models import McpServerRecord
from app.mcp.policy.stdio_policy import normalize_stdio_config, parse_cursor_mcp_entry
from app.mcp.policy.url_policy import assert_mcp_url_allowed
from app.mcp.schemas import (
    McpImportRequest,
    McpImportResponse,
    McpServerCreateRequest,
    McpServerListResponse,
    McpServerResponse,
    McpStdioConfig,
)

logger = get_logger(__name__)


def _row_headers(row: McpServerRecord) -> dict[str, str]:
    h = row.headers if isinstance(row.headers, dict) else {}
    return {str(k): str(v) for k, v in h.items()}


def _row_stdio(row: McpServerRecord) -> dict[str, Any] | None:
    raw = row.stdio_config
    if not isinstance(raw, dict):
        return None
    try:
        return normalize_stdio_config(raw)
    except ValidationError:
        return None


def _mask_headers(headers: dict[str, str]) -> dict[str, str]:
    masked: dict[str, str] = {}
    sensitive = {"authorization", "x-api-key", "api-key", "token"}
    for k, v in headers.items():
        if k.lower() in sensitive:
            masked[k] = v[:6] + "***" if len(v) > 6 else "***"
        else:
            masked[k] = v
    return masked


def _mask_stdio_env(env: dict[str, str]) -> dict[str, str]:
    masked: dict[str, str] = {}
    sensitive_sub = ("key", "secret", "token", "password", "email")
    for k, v in env.items():
        kl = k.lower()
        if any(s in kl for s in sensitive_sub):
            masked[k] = v[:4] + "***" if len(v) > 4 else "***"
        else:
            masked[k] = v
    return masked


def _stdio_to_schema(row: McpServerRecord) -> McpStdioConfig | None:
    cfg = _row_stdio(row)
    if not cfg:
        return None
    env = cfg.get("env")
    env_dict = env if isinstance(env, dict) else {}
    return McpStdioConfig(
        command=str(cfg["command"]),
        args=[str(a) for a in (cfg.get("args") or [])],
        env=_mask_stdio_env({str(k): str(v) for k, v in env_dict.items()}),
        cwd=str(cfg["cwd"]) if cfg.get("cwd") else None,
    )


def _to_response(row: McpServerRecord) -> McpServerResponse:
    names = row.tool_names if isinstance(row.tool_names, list) else []
    probe_at = row.last_probe_at.isoformat() if row.last_probe_at else None
    transport = (row.transport or "http").strip() or "http"
    if transport not in ("http", "stdio"):
        transport = "http"
    return McpServerResponse(
        id=row.id,
        name=row.name,
        transport=transport,  # type: ignore[arg-type]
        url=row.url,
        stdio=_stdio_to_schema(row) if transport == "stdio" else None,
        description=row.description or "",
        enabled=row.enabled,
        headers=_mask_headers(_row_headers(row)),
        tool_names=[str(x) for x in names],
        last_probe_at=probe_at,
        last_probe_error=row.last_probe_error,
    )


async def _discover_for_row(row: McpServerRecord) -> tuple[list[str], str | None]:
    transport = (row.transport or "http").strip() or "http"
    probe_error: str | None = None
    tool_names: list[str] = []
    try:
        if transport == "stdio":
            cfg = _row_stdio(row)
            if not cfg:
                raise ValidationError("stdio 配置无效或缺失")
            tool_names = await discover_tools_stdio(cfg, server_id=row.id)
        else:
            if not row.url:
                raise ValidationError("HTTP MCP 缺少 url")
            safe_url = assert_mcp_url_allowed(row.url)
            row.url = safe_url
            hdrs = _row_headers(row) or None
            tool_names = await discover_tools_http(safe_url, headers=hdrs)
        if not tool_names:
            probe_error = "协议握手成功但未发现任何工具"
    except Exception as exc:
        tool_names = []
        probe_error = str(exc)[:500]
    return tool_names, probe_error


def _register_langchain(row: McpServerRecord, tool_names: list[str]) -> None:
    transport = (row.transport or "http").strip() or "http"
    if not row.enabled or not tool_names:
        register_mcp_tools_for_server(
            row.id,
            row.name,
            transport,
            (row.url or "").rstrip("/") if transport == "http" else None,
            [],
            headers=_row_headers(row) or None,
            stdio_config=_row_stdio(row),
        )
        return
    register_mcp_tools_for_server(
        row.id,
        row.name,
        transport,
        (row.url or "").rstrip("/") if transport == "http" else None,
        tool_names,
        headers=_row_headers(row) or None,
        stdio_config=_row_stdio(row),
    )


class McpService:
    def __init__(self, session: AsyncSession):
        self._session = session

    async def list_servers(self) -> McpServerListResponse:
        r = await self._session.execute(select(McpServerRecord).order_by(McpServerRecord.name))
        rows = r.scalars().all()
        return McpServerListResponse(
            servers=[_to_response(x) for x in rows], total=len(rows)
        )

    async def get_server(self, server_id: str) -> McpServerResponse:
        row = await self._session.get(McpServerRecord, server_id)
        if row is None:
            raise NotFoundError(f"MCP 服务 '{server_id}' 不存在")
        return _to_response(row)

    async def register_server(self, req: McpServerCreateRequest) -> McpServerResponse:
        transport = req.transport
        url: str | None = None
        stdio_raw: dict[str, Any] | None = None
        hdrs = dict(req.headers) if req.headers else {}

        if transport == "http":
            url = assert_mcp_url_allowed(req.url or "")
        else:
            stdio_raw = normalize_stdio_config(req.stdio.model_dump() if req.stdio else None)

        server_id = str(uuid.uuid4())
        row = McpServerRecord(
            id=server_id,
            name=req.name,
            transport=transport,
            url=url,
            stdio_config=stdio_raw,
            description=req.description or "",
            enabled=req.enabled,
            headers=hdrs,
            tool_names=[],
        )
        self._session.add(row)
        await self._session.flush()

        tool_names, probe_error = await _discover_for_row(row)
        row.tool_names = tool_names
        row.last_probe_at = datetime.now(timezone.utc)
        row.last_probe_error = probe_error

        if req.enabled and tool_names:
            _register_langchain(row, tool_names)

        logger.info(
            "注册 MCP 服务 id=%s name=%s transport=%s tools=%s",
            server_id,
            req.name,
            transport,
            tool_names,
        )
        return _to_response(row)

    async def import_cursor_config(self, req: McpImportRequest) -> McpImportResponse:
        imported: list[McpServerResponse] = []
        errors: list[str] = []
        for name, conf in req.mcpServers.items():
            try:
                disp_name, transport, url, stdio_raw, headers = parse_cursor_mcp_entry(name, conf)
                create = McpServerCreateRequest(
                    name=disp_name,
                    transport=transport,  # type: ignore[arg-type]
                    url=url,
                    stdio=McpStdioConfig(**stdio_raw) if stdio_raw else None,
                    headers=headers,
                    enabled=True,
                )
                imported.append(await self.register_server(create))
            except Exception as exc:
                errors.append(f"{name}: {exc}")
        return McpImportResponse(imported=imported, errors=errors)

    async def delete_server(self, server_id: str) -> None:
        row = await self._session.get(McpServerRecord, server_id)
        if row is None:
            raise NotFoundError(f"MCP 服务 '{server_id}' 不存在")
        unregister_mcp_tools_for_server(server_id)
        await stdio_pool.close_server(server_id)
        await self._session.delete(row)
        logger.info("删除 MCP 服务 id=%s", server_id)

    async def refresh_tools(self, server_id: str) -> McpServerResponse:
        row = await self._session.get(McpServerRecord, server_id)
        if row is None:
            raise NotFoundError(f"MCP 服务 '{server_id}' 不存在")
        tool_names, probe_error = await _discover_for_row(row)
        row.tool_names = tool_names
        row.last_probe_at = datetime.now(timezone.utc)
        row.last_probe_error = probe_error
        await self._session.flush()
        _register_langchain(row, tool_names if row.enabled else [])
        logger.info("刷新 MCP 工具 id=%s tools=%s", server_id, tool_names)
        return _to_response(row)


async def probe_enabled_mcp_servers(session: AsyncSession) -> None:
    r = await session.execute(
        select(McpServerRecord).where(McpServerRecord.enabled.is_(True))
    )
    rows = r.scalars().all()
    now = datetime.now(timezone.utc)
    concurrency = get_settings().mcp_probe_concurrency
    sem = asyncio.Semaphore(concurrency)

    async def _probe_row(row: McpServerRecord) -> None:
        async with sem:
            try:
                tool_names, probe_error = await _discover_for_row(row)
                row.tool_names = tool_names
                row.last_probe_at = now
                row.last_probe_error = probe_error
                _register_langchain(row, tool_names)
                logger.info("MCP 周期探测 id=%s tools=%s", row.id, tool_names)
            except Exception as exc:
                row.last_probe_at = now
                row.last_probe_error = str(exc)[:2000]
                logger.warning("MCP 周期探测失败 id=%s: %s", row.id, exc)

    await asyncio.gather(*(_probe_row(row) for row in rows))


async def restore_mcp_tool_registrations(session: AsyncSession) -> None:
    r = await session.execute(select(McpServerRecord))
    rows = r.scalars().all()
    for row in rows:
        if not row.enabled:
            continue
        tool_names = row.tool_names if isinstance(row.tool_names, list) else []
        if not tool_names:
            tool_names, _ = await _discover_for_row(row)
            row.tool_names = tool_names
            if not tool_names:
                logger.warning("启动时未能为 MCP id=%s 发现工具，跳过挂载", row.id)
                continue
        _register_langchain(row, tool_names)
        logger.info(
            "启动恢复 MCP 工具 id=%s name=%s transport=%s tools=%s",
            row.id,
            row.name,
            row.transport,
            len(tool_names),
        )

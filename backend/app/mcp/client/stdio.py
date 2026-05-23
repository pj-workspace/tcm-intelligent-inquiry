"""MCP stdio 传输：discover_tools / call_tool（与 Cursor mcp.json command 配置兼容）。"""

from __future__ import annotations

import asyncio
from typing import Any

import mcp.types as types
from mcp.client.session import ClientSession

from app.core.logging import get_logger
from app.mcp.client.http import _format_call_tool_result
from app.mcp.client.stdio_pool import stdio_pool
from app.mcp.policy.stdio_policy import normalize_stdio_config
from app.mcp.schema_tools import McpToolDef

logger = get_logger(__name__)

_DISCOVER_TIMEOUT = 60
_CALL_TIMEOUT = 120


async def _list_tools(session: ClientSession) -> list[McpToolDef]:
    """Internal helper: list tools."""
    tools: list[McpToolDef] = []
    cursor: str | None = None
    while True:
        if cursor is None:
            result = await session.list_tools()
        else:
            result = await session.list_tools(
                params=types.PaginatedRequestParams(cursor=cursor)
            )
        for t in result.tools:
            schema = t.inputSchema if isinstance(t.inputSchema, dict) else None
            tools.append(McpToolDef(name=t.name, input_schema=schema))
        if not result.nextCursor:
            break
        cursor = result.nextCursor
    return tools


async def _list_tool_names(session: ClientSession) -> list[str]:
    """Internal helper: list tool names."""
    return [t.name for t in await _list_tools(session)]


async def discover_tools_stdio(
    stdio_config: dict[str, Any],
    *,
    server_id: str | None = None,
) -> list[McpToolDef]:
    """连接 stdio MCP 并返回 tools/list（含 inputSchema）。"""
    config = normalize_stdio_config(stdio_config)
    sid = server_id or "__discover__"

    async def _attempt() -> list[McpToolDef]:
        """Internal helper: attempt."""
        async def _fn(session: ClientSession) -> list[McpToolDef]:
            """Internal helper: fn."""
            return await _list_tools(session)

        return await stdio_pool.run(sid, config, _fn)

    try:
        names = await asyncio.wait_for(_attempt(), timeout=_DISCOVER_TIMEOUT)
        if sid == "__discover__":
            await stdio_pool.close_server(sid)
        return names
    except asyncio.TimeoutError:
        await stdio_pool.close_server(sid)
        logger.warning("stdio MCP discover 超时 server_id=%s", sid)
        return []
    except Exception as exc:
        await stdio_pool.close_server(sid)
        logger.warning("stdio MCP discover 失败: %s", exc)
        raise


async def call_tool_stdio(
    server_id: str,
    stdio_config: dict[str, Any],
    tool_name: str,
    arguments: dict[str, Any],
) -> str:
    """调用 stdio MCP tools/call。"""
    config = normalize_stdio_config(stdio_config)
    logger.info("stdio MCP call_tool id=%s tool=%s", server_id, tool_name)

    async def _fn(session: ClientSession) -> str:
        """Internal helper: fn."""
        result = await session.call_tool(tool_name, arguments or {})
        return _format_call_tool_result(result)

    try:
        return await asyncio.wait_for(
            stdio_pool.run(server_id, config, _fn),
            timeout=_CALL_TIMEOUT,
        )
    except asyncio.TimeoutError:
        await stdio_pool.close_server(server_id)
        return f"MCP 调用超时（>{_CALL_TIMEOUT}s）"
    except Exception as exc:
        await stdio_pool.close_server(server_id)
        return f"MCP stdio 调用失败: {exc!s}"

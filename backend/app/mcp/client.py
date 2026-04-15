"""MCP 客户端：Streamable HTTP / SSE 传输上的 list_tools 与 call_tool。"""

from __future__ import annotations

import json
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any

import httpx
import mcp.types as types
from mcp.client.session import ClientSession
from mcp.client.sse import sse_client
from mcp.client.streamable_http import streamable_http_client

from app.core.logging import get_logger

logger = get_logger(__name__)


async def probe_server_reachable(server_url: str) -> bool:
    """HEAD/GET 根路径，判断服务是否在线（辅助诊断，非 MCP 协议）。"""
    base = server_url.rstrip("/")
    timeout = httpx.Timeout(5.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        for method, path in (("HEAD", ""), ("GET", "/"), ("GET", "/health")):
            try:
                url = f"{base}{path}" if path else base
                if method == "HEAD":
                    r = await client.head(url)
                else:
                    r = await client.get(url)
                if r.status_code < 500:
                    return True
            except httpx.HTTPError as exc:
                logger.debug("MCP probe %s %s: %s", method, url, exc)
    return False


@asynccontextmanager
async def _open_mcp_session(
    server_url: str,
) -> AsyncGenerator[ClientSession, None]:
    """依次尝试 Streamable HTTP、SSE，建立已 initialize 的 ClientSession。"""
    url = server_url.rstrip("/")
    last_exc: Exception | None = None
    for factory in (streamable_http_client, sse_client):
        try:
            async with factory(url) as streams:  # type: ignore[arg-type]
                read_stream, write_stream = streams[0], streams[1]
                async with ClientSession(read_stream, write_stream) as session:
                    await session.initialize()
                    yield session
                    return
        except Exception as exc:
            last_exc = exc
            logger.debug("MCP transport %s failed for %s: %s", factory.__name__, url, exc)
    raise RuntimeError(
        f"无法通过 Streamable HTTP 或 SSE 连接 MCP 端点: {url}"
    ) from last_exc


async def _list_tool_names(session: ClientSession) -> list[str]:
    names: list[str] = []
    cursor: str | None = None
    while True:
        if cursor is None:
            result = await session.list_tools()
        else:
            result = await session.list_tools(
                params=types.PaginatedRequestParams(cursor=cursor)
            )
        names.extend(t.name for t in result.tools)
        if not result.nextCursor:
            break
        cursor = result.nextCursor
    return names


def _format_call_tool_result(result: types.CallToolResult) -> str:
    parts: list[str] = []
    for block in result.content:
        if isinstance(block, types.TextContent):
            parts.append(block.text)
        elif isinstance(block, types.ImageContent):
            parts.append("[image]")
        else:
            parts.append(block.model_dump_json())
    if result.structuredContent is not None:
        parts.append(json.dumps(result.structuredContent, ensure_ascii=False))
    text = "\n".join(parts) if parts else ""
    if result.isError:
        return "工具执行报错:\n" + text if text else "工具执行报错（无详情）"
    return text if text else "(空结果)"


async def discover_tools(server_url: str) -> list[str]:
    """连接 MCP 服务并返回 tools/list 中的工具名。"""
    try:
        async with _open_mcp_session(server_url) as session:
            return await _list_tool_names(session)
    except Exception as exc:
        logger.warning("MCP discover_tools 失败 url=%s: %s", server_url, exc)
    # 退化：仅 HTTP 探测，避免把普通站点误标为可用工具
    if await probe_server_reachable(server_url):
        logger.info("MCP 协议握手失败但 HTTP 可达: %s", server_url)
    return []


async def call_tool(server_url: str, tool_name: str, arguments: dict[str, Any]) -> str:
    """调用 tools/call 并返回文本化结果。"""
    logger.info("MCP call_tool url=%s tool=%s", server_url, tool_name)
    try:
        async with _open_mcp_session(server_url) as session:
            result = await session.call_tool(tool_name, arguments or {})
            return _format_call_tool_result(result)
    except Exception as exc:
        logger.warning("MCP call_tool 失败: %s", exc)
        return (
            f"MCP 调用失败：无法完成协议握手或请求异常。"
            f"请确认 `url` 为 MCP Streamable HTTP 或 SSE 端点（常见路径如 /mcp）。"
            f" 详情: {exc!s}"
        )

"""将远端 MCP 工具包装为 LangChain BaseTool，挂入全局 tool_registry。"""

from __future__ import annotations

import re
from typing import Any

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from app.core.logging import get_logger
from app.mcp.client.http import call_tool as call_tool_http
from app.mcp.client.stdio import call_tool_stdio

logger = get_logger(__name__)

_mcp_registered_lc_names: dict[str, list[str]] = {}
_mcp_server_headers: dict[str, dict[str, str]] = {}
_mcp_server_transport: dict[str, str] = {}
_mcp_server_url: dict[str, str] = {}
_mcp_stdio_config: dict[str, dict[str, Any]] = {}
_mcp_tool_meta: dict[str, dict[str, str]] = {}


def get_mcp_tool_metadata(lc_name: str) -> dict[str, str] | None:
    """LangChain 工具名 → MCP 服务展示名 / 远端工具名 / transport。"""
    meta = _mcp_tool_meta.get(lc_name)
    return dict(meta) if meta else None


def _sanitize_segment(name: str, max_len: int = 40) -> str:
    s = re.sub(r"[^a-zA-Z0-9_-]+", "_", (name or "").strip())
    s = s.strip("_") or "tool"
    return s[:max_len]


def make_lc_tool_name(server_id: str, remote_tool_name: str) -> str:
    sid = server_id.replace("-", "")[:8]
    return f"mcp_{sid}_{_sanitize_segment(remote_tool_name)}"


def _unique_lc_name(base: str, taken: set[str]) -> str:
    name = base
    n = 2
    while name in taken:
        name = f"{base}_{n}"
        n += 1
    return name


class McpProxyArgs(BaseModel):
    arguments: dict[str, Any] = Field(
        default_factory=dict,
        description="传给 MCP 工具的参数字典；无参数时传空对象 {}。",
    )


def _build_structured_tool(
    *,
    lc_name: str,
    server_id: str,
    server_display_name: str,
    transport: str,
    server_url: str | None,
    remote_tool_name: str,
    server_headers: dict[str, str] | None = None,
    stdio_config: dict[str, Any] | None = None,
) -> StructuredTool:
    if transport == "stdio":
        cmd = (stdio_config or {}).get("command", "?")
        desc = (
            f"[MCP stdio] 服务「{server_display_name}」提供的工具，远端名 `{remote_tool_name}`。"
            f"（本地进程 `{cmd}`，由后端拉起，与 Cursor mcp.json 相同。）"
        )
    else:
        desc = (
            f"[MCP] 服务「{server_display_name}」提供的工具，远端名 `{remote_tool_name}`。"
            "（服务端点已在系统中登记，不在此展示完整 URL。）"
        )
    _headers = dict(server_headers) if server_headers else None
    _stdio = dict(stdio_config) if stdio_config else None

    async def _acall(arguments: dict[str, Any] | None = None) -> str:
        args = dict(arguments or {})
        if transport == "stdio":
            if not _stdio:
                return "MCP stdio 配置缺失"
            return await call_tool_stdio(server_id, _stdio, remote_tool_name, args)
        if not server_url:
            return "MCP HTTP url 缺失"
        return await call_tool_http(server_url, remote_tool_name, args, headers=_headers)

    def _sync_stub(arguments: dict[str, Any] | None = None) -> str:
        raise RuntimeError("MCP 工具仅支持异步调用")

    return StructuredTool.from_function(
        name=lc_name,
        description=desc,
        func=_sync_stub,
        coroutine=_acall,
        args_schema=McpProxyArgs,
    )


def register_mcp_tools_for_server(
    server_id: str,
    server_display_name: str,
    transport: str,
    server_url: str | None,
    remote_tool_names: list[str],
    headers: dict[str, str] | None = None,
    stdio_config: dict[str, Any] | None = None,
) -> list[str]:
    from app.agent.tools.registry import tool_registry

    unregister_mcp_tools_for_server(server_id)
    _mcp_server_transport[server_id] = transport
    _mcp_server_headers[server_id] = dict(headers) if headers else {}
    _mcp_server_url[server_id] = (server_url or "").rstrip("/")
    _mcp_stdio_config[server_id] = dict(stdio_config) if stdio_config else {}

    taken = set(tool_registry.names())
    registered: list[str] = []
    for remote in remote_tool_names:
        if not (remote or "").strip():
            continue
        base = make_lc_tool_name(server_id, remote)
        lc_name = _unique_lc_name(base, taken)
        taken.add(lc_name)
        tool = _build_structured_tool(
            lc_name=lc_name,
            server_id=server_id,
            server_display_name=server_display_name,
            transport=transport,
            server_url=_mcp_server_url.get(server_id) or None,
            remote_tool_name=remote.strip(),
            server_headers=headers,
            stdio_config=stdio_config,
        )
        tool_registry.register(tool)
        registered.append(lc_name)
        _mcp_tool_meta[lc_name] = {
            "server_display_name": server_display_name,
            "remote_tool_name": remote.strip(),
            "transport": transport,
        }
        logger.info("已注册 MCP LangChain 工具 name=%s remote=%s", lc_name, remote)

    _mcp_registered_lc_names[server_id] = registered
    from app.agent.executor import invalidate_default_graph_cache

    invalidate_default_graph_cache()
    return registered


def unregister_mcp_tools_for_server(server_id: str) -> None:
    from app.agent.executor import invalidate_default_graph_cache
    from app.agent.tools.registry import tool_registry

    names = _mcp_registered_lc_names.pop(server_id, [])
    _mcp_server_headers.pop(server_id, None)
    _mcp_server_transport.pop(server_id, None)
    _mcp_server_url.pop(server_id, None)
    _mcp_stdio_config.pop(server_id, None)
    for n in names:
        tool_registry.unregister(n)
        _mcp_tool_meta.pop(n, None)
        logger.info("已卸载 MCP LangChain 工具 name=%s", n)
    if names:
        invalidate_default_graph_cache()


def get_registered_lc_names(server_id: str) -> list[str]:
    return list(_mcp_registered_lc_names.get(server_id, []))

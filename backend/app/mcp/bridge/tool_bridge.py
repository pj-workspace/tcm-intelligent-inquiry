"""将远端 MCP 工具包装为 LangChain BaseTool，挂入全局 tool_registry。"""

from __future__ import annotations

import re
from typing import Any

from langchain_core.tools import StructuredTool

from app.core.logging import get_logger
from app.mcp.client.http import call_tool as call_tool_http
from app.mcp.client.stdio import call_tool_stdio
from app.mcp.schema_tools import (
    McpToolDef,
    build_mcp_args_schema,
    normalize_mcp_tool_arguments,
    sanitize_mcp_call_arguments,
)

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


def mcp_tool_sse_metadata(lc_name: str) -> dict[str, str]:
    """供 SSE / 历史消息附带 MCP 远端工具名，避免前端解析 LangChain 内部名。"""
    meta = get_mcp_tool_metadata(lc_name)
    if not meta:
        return {}
    out: dict[str, str] = {}
    remote = (meta.get("remote_tool_name") or "").strip()
    if remote:
        out["mcpRemoteName"] = remote
    server = (meta.get("server_display_name") or "").strip()
    if server:
        out["mcpServer"] = server
    return out


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


def _build_structured_tool(
    *,
    lc_name: str,
    server_id: str,
    server_display_name: str,
    transport: str,
    server_url: str | None,
    remote_tool_name: str,
    input_schema: dict[str, Any] | None = None,
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
    _schema = input_schema
    args_schema = build_mcp_args_schema(remote_tool_name, input_schema)
    if isinstance(input_schema, dict):
        req = input_schema.get("required")
        if isinstance(req, list) and req:
            desc += (
                f" 必填：{', '.join(str(x) for x in req)}。"
                "可选字符串参数勿传 null，不需要则省略该字段。"
            )

    async def _acall(**kwargs: Any) -> str:
        try:
            args = sanitize_mcp_call_arguments(
                normalize_mcp_tool_arguments(kwargs),
                _schema,
            )
            if transport == "stdio":
                if not _stdio:
                    return "MCP stdio 配置缺失"
                return await call_tool_stdio(server_id, _stdio, remote_tool_name, args)
            if not server_url:
                return "MCP HTTP url 缺失"
            return await call_tool_http(
                server_url, remote_tool_name, args, headers=_headers
            )
        except Exception as exc:
            logger.warning("MCP 工具执行异常 name=%s: %s", lc_name, exc)
            return f"MCP 工具执行失败: {exc!s}"

    return StructuredTool.from_function(
        name=lc_name,
        description=desc,
        coroutine=_acall,
        args_schema=args_schema,
    )


def register_mcp_tools_for_server(
    server_id: str,
    server_display_name: str,
    transport: str,
    server_url: str | None,
    remote_tool_names: list[str],
    headers: dict[str, str] | None = None,
    stdio_config: dict[str, Any] | None = None,
    remote_tool_defs: list[McpToolDef] | None = None,
) -> list[str]:
    from app.agent.tools.registry import tool_registry

    unregister_mcp_tools_for_server(server_id)
    _mcp_server_transport[server_id] = transport
    _mcp_server_headers[server_id] = dict(headers) if headers else {}
    _mcp_server_url[server_id] = (server_url or "").rstrip("/")
    _mcp_stdio_config[server_id] = dict(stdio_config) if stdio_config else {}

    schema_by_name = {
        d.name: d.input_schema for d in (remote_tool_defs or []) if d.name
    }
    taken = set(tool_registry.names())
    registered: list[str] = []
    for remote in remote_tool_names:
        if not (remote or "").strip():
            continue
        remote = remote.strip()
        base = make_lc_tool_name(server_id, remote)
        lc_name = _unique_lc_name(base, taken)
        taken.add(lc_name)
        tool = _build_structured_tool(
            lc_name=lc_name,
            server_id=server_id,
            server_display_name=server_display_name,
            transport=transport,
            server_url=_mcp_server_url.get(server_id) or None,
            remote_tool_name=remote,
            input_schema=schema_by_name.get(remote),
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

"""stdio MCP 长连接池：每个 server_id 维持一条 ClientSession，供 discover / call_tool 复用。"""

from __future__ import annotations

import asyncio
from contextlib import AsyncExitStack
from typing import Any

from mcp.client.session import ClientSession
from mcp.client.stdio import StdioServerParameters, stdio_client

from app.core.logging import get_logger

logger = get_logger(__name__)

_SESSION_TIMEOUT = 30


class _StdioEntry:
    """Stdio Entry."""
    def __init__(self, server_id: str) -> None:
        """Initialize instance."""
        self.server_id = server_id
        self.lock = asyncio.Lock()
        self.stack: AsyncExitStack | None = None
        self.session: ClientSession | None = None

    async def close(self) -> None:
        """Close."""
        if self.stack is not None:
            try:
                await self.stack.aclose()
            except Exception as exc:
                logger.debug("stdio MCP 关闭 id=%s: %s", self.server_id, exc)
        self.stack = None
        self.session = None


class StdioMcpPool:
    """Stdio Mcp Pool."""
    def __init__(self) -> None:
        """Initialize instance."""
        self._entries: dict[str, _StdioEntry] = {}
        self._meta_lock = asyncio.Lock()

    async def close_server(self, server_id: str) -> None:
        """Close server (``server_id``)."""
        async with self._meta_lock:
            entry = self._entries.pop(server_id, None)
        if entry:
            async with entry.lock:
                await entry.close()

    async def close_all(self) -> None:
        """Close all."""
        async with self._meta_lock:
            ids = list(self._entries.keys())
        for sid in ids:
            await self.close_server(sid)

    def _to_params(self, config: dict[str, Any]) -> StdioServerParameters:
        """Internal helper: to params."""
        kwargs: dict[str, Any] = {
            "command": str(config["command"]),
            "args": list(config.get("args") or []),
            "env": dict(config.get("env") or {}),
        }
        if config.get("cwd"):
            kwargs["cwd"] = str(config["cwd"])
        return StdioServerParameters(**kwargs)

    async def _connect(self, server_id: str, config: dict[str, Any]) -> _StdioEntry:
        """Internal helper: connect."""
        entry = _StdioEntry(server_id)
        stack = AsyncExitStack()
        params = self._to_params(config)
        try:
            read_stream, write_stream = await stack.enter_async_context(stdio_client(params))
            session = await stack.enter_async_context(ClientSession(read_stream, write_stream))
            await asyncio.wait_for(session.initialize(), timeout=_SESSION_TIMEOUT)
        except Exception:
            await stack.aclose()
            raise
        entry.stack = stack
        entry.session = session
        async with self._meta_lock:
            old = self._entries.pop(server_id, None)
            self._entries[server_id] = entry
        if old:
            await old.close()
        logger.info("stdio MCP 已连接 id=%s cmd=%s", server_id, params.command)
        return entry

    async def _get_entry(self, server_id: str, config: dict[str, Any]) -> _StdioEntry:
        """Internal helper: get entry."""
        async with self._meta_lock:
            entry = self._entries.get(server_id)
        if entry and entry.session is not None:
            return entry
        return await self._connect(server_id, config)

    async def run(
        self,
        server_id: str,
        config: dict[str, Any],
        fn,
    ):
        """在可复用 session 上执行 fn(session)；失败时重连一次。"""
        last_exc: Exception | None = None
        for attempt in range(2):
            entry = await self._get_entry(server_id, config)
            async with entry.lock:
                if entry.session is None:
                    continue
                try:
                    return await fn(entry.session)
                except Exception as exc:
                    last_exc = exc
                    logger.warning(
                        "stdio MCP 调用失败 id=%s attempt=%s: %s",
                        server_id,
                        attempt + 1,
                        exc,
                    )
                    await entry.close()
                    async with self._meta_lock:
                        self._entries.pop(server_id, None)
        raise RuntimeError(f"stdio MCP 会话不可用: {last_exc}") from last_exc


stdio_pool = StdioMcpPool()

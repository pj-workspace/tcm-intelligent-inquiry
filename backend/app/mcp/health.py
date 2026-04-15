"""MCP 周期健康探测（应用进程内 asyncio 后台任务）。"""

import asyncio

from app.core.config import get_settings
from app.core.database import async_session_factory
from app.core.logging import get_logger
from app.mcp.service import probe_enabled_mcp_servers

logger = get_logger(__name__)


async def run_mcp_probe_loop() -> None:
    """按 `mcp_probe_interval_seconds` 周期调用 `probe_enabled_mcp_servers`。"""
    while True:
        s = get_settings()
        interval = s.mcp_probe_interval_seconds
        if interval <= 0:
            await asyncio.sleep(60)
            continue
        await asyncio.sleep(interval)
        try:
            async with async_session_factory() as session:
                await probe_enabled_mcp_servers(session)
                await session.commit()
        except Exception:
            logger.exception("MCP 周期探测任务失败")

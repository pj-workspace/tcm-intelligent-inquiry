"""厂商余额查询 registry（仅注册有可程序化接口的厂商）。"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import TYPE_CHECKING

from app.llm.billing.schemas import BalanceSnapshot
from app.llm.providers.deepseek_balance import fetch_deepseek_balance_snapshot

if TYPE_CHECKING:
    from app.core.config import Settings

BalanceFetcherFn = Callable[["Settings"], Awaitable[BalanceSnapshot]]

BALANCE_FETCHERS: dict[str, BalanceFetcherFn] = {
    "deepseek": fetch_deepseek_balance_snapshot,
}


async def fetch_provider_balance(provider_id: str, settings: "Settings") -> BalanceSnapshot:
    """Fetch provider balance (``provider_id``, ``settings``)."""
    pid = (provider_id or "").strip().lower()
    fn = BALANCE_FETCHERS.get(pid)
    if fn is None:
        raise KeyError(pid)
    return await fn(settings)

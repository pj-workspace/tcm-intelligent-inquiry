"""DeepSeek GET /user/balance（与 Chat completions 的 /v1 基址脱钩）。"""

from __future__ import annotations

from typing import TYPE_CHECKING

import httpx

from app.llm.billing.schemas import BalanceLineItem, BalanceSnapshot
from app.llm.providers.deepseek_balance_coerce import balance_is_available_field

if TYPE_CHECKING:
    from app.core.config import Settings


def deepseek_balance_api_root(base_url: str) -> str:
    """DEEPSEEK_BASE_URL 常为 .../v1，余额接口在同级 /user/balance。"""
    u = (base_url or "").strip().rstrip("/")
    if u.endswith("/v1"):
        u = u[:-3].rstrip("/")
    return u or "https://api.deepseek.com"


def balance_url_for_settings(settings: "Settings") -> str:
    """Balance url for settings (``settings``)."""
    base = (settings.deepseek_base_url or "").strip() or "https://api.deepseek.com/v1"
    root = deepseek_balance_api_root(base)
    return f"{root}/user/balance"


async def fetch_deepseek_balance_snapshot(settings: "Settings") -> BalanceSnapshot:
    """Fetch deepseek balance snapshot (``settings``)."""
    key = (settings.deepseek_api_key or "").strip()
    if not key:
        raise ValueError("未配置 DEEPSEEK_API_KEY")

    url = balance_url_for_settings(settings)
    headers = {"Authorization": f"Bearer {key}"}

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(url, headers=headers)

    if resp.status_code >= 400:
        raise RuntimeError(f"DeepSeek balance HTTP {resp.status_code}")

    data = resp.json()
    if not isinstance(data, dict):
        raise RuntimeError("DeepSeek balance 响应非法")

    is_avail = balance_is_available_field(data.get("is_available"))

    balances_out: list[BalanceLineItem] = []
    raw_infos = data.get("balance_infos")
    if isinstance(raw_infos, list):
        for item in raw_infos:
            if not isinstance(item, dict):
                continue
            balances_out.append(
                BalanceLineItem(
                    currency=str(item.get("currency") or ""),
                    total_balance=str(item.get("total_balance") or ""),
                    granted_balance=str(item.get("granted_balance") or ""),
                    topped_up_balance=str(item.get("topped_up_balance") or ""),
                )
            )

    snap = BalanceSnapshot(
        provider_id="deepseek",
        is_available=is_avail,
        balances=balances_out,
        raw=data if isinstance(data, dict) else {},
    )
    return snap

"""Pydantic：余额快照（多厂商统一返回）。"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class BalanceLineItem(BaseModel):
    """单币种余额（DeepSeek balance_infos 等可映射到此结构）。"""

    currency: str = ""
    total_balance: str = ""
    granted_balance: str = ""
    topped_up_balance: str = ""


class BalanceSnapshot(BaseModel):
    """程序化余额查询的统一响应体（写入快照表 payload 时可 model_dump）。"""

    provider_id: str
    is_available: bool | None = None
    balances: list[BalanceLineItem] = Field(default_factory=list)
    raw: dict[str, Any] = Field(default_factory=dict)


# ── 用户用量只读 API ──────────────────────────────────────────────────────────


class BillingPeriodOut(BaseModel):
    """UTC ISO8601 时间边界（滑动窗口：终点为服务端请求时刻）。"""

    start: str
    end: str


class BillingTotalsOut(BaseModel):
    """Billing Totals Out."""
    requests: int
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int


class BillingProviderBreakdownRow(BaseModel):
    """Billing Provider Breakdown Row."""
    provider_id: str
    requests: int
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int


class UsageSummaryResponse(BaseModel):
    """Usage Summary Response data model."""
    period: BillingPeriodOut
    totals: BillingTotalsOut
    by_provider: list[BillingProviderBreakdownRow]


class UsageEventItemOut(BaseModel):
    """Usage Event Item Out."""
    usage_event_id: str
    created_at: str
    provider_id: str
    chat_model: str | None
    conversation_id: str | None
    conversation_title: str | None = None
    prompt_tokens: int | None
    completion_tokens: int | None
    total_tokens: int | None


class UsageEventsResponse(BaseModel):
    """Usage Events Response data model."""
    items: list[UsageEventItemOut]
    limit: int
    offset: int


class ConversationBillingTotalsResponse(BaseModel):
    """单会话下当前用户的用量汇总（跨厂商）。"""

    totals: BillingTotalsOut

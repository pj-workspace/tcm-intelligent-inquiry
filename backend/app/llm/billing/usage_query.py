"""当前用户在 llm_usage_events 上的只读聚合与分页列表。"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.chat.models import ConversationRecord
from app.llm.billing.models import LlmUsageEventRecord


MAX_USAGE_EVENTS_LIMIT = 100
MAX_SUMMARY_DAYS = 365


def _effective_total_expr():
    """单列计费近似：total_tokens 优先，否则 prompt + completion。"""
    return func.coalesce(
        LlmUsageEventRecord.total_tokens,
        func.coalesce(LlmUsageEventRecord.prompt_tokens, 0)
        + func.coalesce(LlmUsageEventRecord.completion_tokens, 0),
    )


@dataclass(frozen=True)
class SummaryTotalsRow:
    """Summary Totals Row."""
    requests: int
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int


async def fetch_usage_summary_for_user(
    session: AsyncSession,
    *,
    user_id: str,
    days: int,
    provider_id: str | None,
) -> tuple[datetime, datetime, SummaryTotalsRow, list[dict[str, Any]]]:
    """返回 period_end(start,end UTC)、汇总 totals、by_provider 行字典列表。"""
    d = max(1, min(int(days), MAX_SUMMARY_DAYS))
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=d)

    filt = [
        LlmUsageEventRecord.user_id == user_id,
        LlmUsageEventRecord.created_at >= start,
        LlmUsageEventRecord.created_at <= end,
    ]
    pid = (provider_id or "").strip().lower()
    if pid:
        filt.append(LlmUsageEventRecord.provider_id == pid)

    eff = _effective_total_expr()

    totals_stmt = select(
        func.count(LlmUsageEventRecord.id).label("requests"),
        func.coalesce(func.sum(func.coalesce(LlmUsageEventRecord.prompt_tokens, 0)), 0).label(
            "prompt_tokens"
        ),
        func.coalesce(func.sum(func.coalesce(LlmUsageEventRecord.completion_tokens, 0)), 0).label(
            "completion_tokens"
        ),
        func.coalesce(func.sum(eff), 0).label("total_tokens"),
    ).where(and_(*filt))

    by_pv_stmt = (
        select(
            LlmUsageEventRecord.provider_id.label("provider_id"),
            func.count(LlmUsageEventRecord.id).label("requests"),
            func.coalesce(func.sum(func.coalesce(LlmUsageEventRecord.prompt_tokens, 0)), 0).label(
                "prompt_tokens"
            ),
            func.coalesce(func.sum(func.coalesce(LlmUsageEventRecord.completion_tokens, 0)), 0).label(
                "completion_tokens"
            ),
            func.coalesce(func.sum(eff), 0).label("total_tokens"),
        )
        .where(and_(*filt))
        .group_by(LlmUsageEventRecord.provider_id)
        .order_by(LlmUsageEventRecord.provider_id.asc())
    )

    tr = await session.execute(totals_stmt)
    totals_row = tr.one()

    br = await session.execute(by_pv_stmt)
    by_provider = [
        {
            "provider_id": row.provider_id,
            "requests": int(row.requests or 0),
            "prompt_tokens": int(row.prompt_tokens or 0),
            "completion_tokens": int(row.completion_tokens or 0),
            "total_tokens": int(row.total_tokens or 0),
        }
        for row in br.all()
    ]

    totals = SummaryTotalsRow(
        requests=int(totals_row.requests or 0),
        prompt_tokens=int(totals_row.prompt_tokens or 0),
        completion_tokens=int(totals_row.completion_tokens or 0),
        total_tokens=int(totals_row.total_tokens or 0),
    )
    return start, end, totals, by_provider


@dataclass(frozen=True)
class UsageEventListRow:
    """用量事件列表行（含可选会话标题）。"""

    event: LlmUsageEventRecord
    conversation_title: str | None


async def fetch_usage_events_for_user(
    session: AsyncSession,
    *,
    user_id: str,
    limit: int,
    offset: int,
    provider_id: str | None = None,
) -> list[UsageEventListRow]:
    """Fetch usage events for user。"""
    lim = max(1, min(int(limit), MAX_USAGE_EVENTS_LIMIT))
    off = max(0, int(offset))

    filt = [LlmUsageEventRecord.user_id == user_id]
    pid = (provider_id or "").strip().lower()
    if pid:
        filt.append(LlmUsageEventRecord.provider_id == pid)

    stmt = (
        select(LlmUsageEventRecord, ConversationRecord.title)
        .outerjoin(
            ConversationRecord,
            ConversationRecord.id == LlmUsageEventRecord.conversation_id,
        )
        .where(and_(*filt))
        .order_by(LlmUsageEventRecord.created_at.desc())
        .limit(lim)
        .offset(off)
    )
    res = await session.execute(stmt)
    return [
        UsageEventListRow(
            event=event,
            conversation_title=(title.strip() if title and title.strip() else None),
        )
        for event, title in res.all()
    ]


async def fetch_usage_totals_for_conversation(
    session: AsyncSession,
    *,
    user_id: str,
    conversation_id: str,
) -> SummaryTotalsRow:
    """指定会话且归属当前登录用户的用量聚合（无时间窗）。"""
    cid = (conversation_id or "").strip()
    eff = _effective_total_expr()
    filt = [
        LlmUsageEventRecord.user_id == user_id,
        LlmUsageEventRecord.conversation_id == cid,
    ]
    totals_stmt = select(
        func.count(LlmUsageEventRecord.id).label("requests"),
        func.coalesce(func.sum(func.coalesce(LlmUsageEventRecord.prompt_tokens, 0)), 0).label(
            "prompt_tokens"
        ),
        func.coalesce(func.sum(func.coalesce(LlmUsageEventRecord.completion_tokens, 0)), 0).label(
            "completion_tokens"
        ),
        func.coalesce(func.sum(eff), 0).label("total_tokens"),
    ).where(and_(*filt))

    tr = await session.execute(totals_stmt)
    row = tr.one()
    return SummaryTotalsRow(
        requests=int(row.requests or 0),
        prompt_tokens=int(row.prompt_tokens or 0),
        completion_tokens=int(row.completion_tokens or 0),
        total_tokens=int(row.total_tokens or 0),
    )

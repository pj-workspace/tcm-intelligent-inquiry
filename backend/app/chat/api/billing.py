"""Chat 域下的 LLM 计费相关 HTTP 路由。"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.api.deps import get_current_user
from app.auth.models import UserRecord
from app.chat.catalog import catalog_provider_ids
from app.chat.policy.access import assert_can_use_conversation
from app.core.config import get_settings
from app.core.database import async_session_factory, get_session
from app.core.logging import get_logger
from app.llm.billing.balance_registry import BALANCE_FETCHERS, fetch_provider_balance
from app.llm.billing.models import ProviderBalanceSnapshotRecord
from app.llm.billing.schemas import (
    BillingPeriodOut,
    BillingProviderBreakdownRow,
    BillingTotalsOut,
    ConversationBillingTotalsResponse,
    UsageEventItemOut,
    UsageEventsResponse,
    UsageSummaryResponse,
)
from app.llm.billing.usage_query import (
    MAX_USAGE_EVENTS_LIMIT,
    fetch_usage_events_for_user,
    fetch_usage_summary_for_user,
    fetch_usage_totals_for_conversation,
)

logger = get_logger(__name__)

router = APIRouter()


@router.get(
    "/providers/{provider_id}/balance",
    summary="程序化查询厂商账户余额（当前支持 DeepSeek）",
)
async def provider_llm_balance(
    provider_id: str,
    user: Annotated[UserRecord, Depends(get_current_user)],
):
    """Provider llm balance。"""
    pid = provider_id.strip().lower()
    if pid not in catalog_provider_ids():
        raise HTTPException(status_code=404, detail="未知的厂商 ID")
    if pid not in BALANCE_FETCHERS:
        raise HTTPException(status_code=501, detail="该厂商暂不支持程序化余额查询")
    try:
        snap = await fetch_provider_balance(pid, get_settings())
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception:
        logger.exception("程序化余额查询失败 provider_id=%s", pid)
        raise HTTPException(
            status_code=502,
            detail="上游余额服务暂时不可用，请稍后重试",
        ) from None

    sid = str(uuid.uuid4())
    async with async_session_factory() as session:
        session.add(
            ProviderBalanceSnapshotRecord(
                id=sid,
                provider_id=pid,
                fetched_by_user_id=user.id,
                is_available=snap.is_available,
                payload=snap.model_dump(mode="json"),
            )
        )
        await session.commit()

    return snap.model_dump(mode="json")


@router.get(
    "/billing/usage-summary",
    response_model=UsageSummaryResponse,
    summary="当前登录用户在区间内的 LLM 用量汇总",
)
async def billing_usage_summary(
    user: Annotated[UserRecord, Depends(get_current_user)],
    days: int = 30,
    provider_id: str | None = None,
):
    """Billing usage summary。"""
    pid = (provider_id or "").strip().lower() or None
    if pid is not None and pid not in catalog_provider_ids():
        raise HTTPException(status_code=400, detail="无效的 provider_id")

    async with async_session_factory() as session:
        start, end, totals, by_pv = await fetch_usage_summary_for_user(
            session,
            user_id=user.id,
            days=days,
            provider_id=pid,
        )
        await session.commit()

    return UsageSummaryResponse(
        period=BillingPeriodOut(start=start.isoformat(), end=end.isoformat()),
        totals=BillingTotalsOut(
            requests=totals.requests,
            prompt_tokens=totals.prompt_tokens,
            completion_tokens=totals.completion_tokens,
            total_tokens=totals.total_tokens,
        ),
        by_provider=[
            BillingProviderBreakdownRow(
                provider_id=r["provider_id"],
                requests=r["requests"],
                prompt_tokens=r["prompt_tokens"],
                completion_tokens=r["completion_tokens"],
                total_tokens=r["total_tokens"],
            )
            for r in by_pv
        ],
    )


@router.get(
    "/billing/usage-events",
    response_model=UsageEventsResponse,
    summary="当前登录用户用量事件分页",
)
async def billing_usage_events(
    user: Annotated[UserRecord, Depends(get_current_user)],
    limit: int = 50,
    offset: int = 0,
    provider_id: str | None = None,
):
    """Billing usage events。"""
    pid = (provider_id or "").strip().lower() or None
    if pid is not None and pid not in catalog_provider_ids():
        raise HTTPException(status_code=400, detail="无效的 provider_id")

    lim = max(1, min(int(limit), MAX_USAGE_EVENTS_LIMIT))
    off = max(0, int(offset))

    async with async_session_factory() as session:
        rows = await fetch_usage_events_for_user(
            session,
            user_id=user.id,
            limit=lim,
            offset=off,
            provider_id=pid,
        )
        await session.commit()

    items = [
        UsageEventItemOut(
            usage_event_id=r.id,
            created_at=r.created_at.isoformat() if r.created_at else "",
            provider_id=r.provider_id,
            chat_model=r.chat_model,
            conversation_id=r.conversation_id,
            prompt_tokens=r.prompt_tokens,
            completion_tokens=r.completion_tokens,
            total_tokens=r.total_tokens,
        )
        for r in rows
    ]
    return UsageEventsResponse(items=items, limit=lim, offset=off)


@router.get(
    "/conversations/{conversation_id}/billing/usage-summary",
    response_model=ConversationBillingTotalsResponse,
    summary="单会话 LLM 用量汇总（当前登录用户）",
)
async def conversation_billing_usage_summary(
    conversation_id: str,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: Annotated[UserRecord, Depends(get_current_user)],
):
    """Conversation billing usage summary。"""
    cid = conversation_id.strip()
    await assert_can_use_conversation(session, cid, user, None)
    totals_row = await fetch_usage_totals_for_conversation(
        session, user_id=user.id, conversation_id=cid
    )
    await session.commit()
    return ConversationBillingTotalsResponse(
        totals=BillingTotalsOut(
            requests=totals_row.requests,
            prompt_tokens=totals_row.prompt_tokens,
            completion_tokens=totals_row.completion_tokens,
            total_tokens=totals_row.total_tokens,
        )
    )

"""写入用量事件（供 streaming 调用）。"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.llm.billing.models import LlmUsageEventRecord
from app.llm.billing.normalize import normalize_llm_usage


def _norm_columns(norm: dict[str, Any]) -> tuple[int | None, int | None, int | None, int | None, int | None]:
    """Internal helper: norm columns."""
    pt = norm.get("prompt_tokens")
    ct = norm.get("completion_tokens")
    tt = norm.get("total_tokens")
    rt = norm.get("reasoning_tokens")
    cpt = norm.get("cached_prompt_tokens")
    pi = int(pt) if isinstance(pt, int) else None
    ci = int(ct) if isinstance(ct, int) else None
    ti = int(tt) if isinstance(tt, int) else None
    ri = int(rt) if isinstance(rt, int) else None
    cachi = int(cpt) if isinstance(cpt, int) else None
    return pi, ci, ti, ri, cachi


async def insert_llm_usage_event(
    session: AsyncSession,
    *,
    user_id: str | None,
    conversation_id: str | None,
    provider_id: str,
    chat_model: str | None,
    graph_run_id: str | None,
    usage_raw: dict[str, Any],
    usage_meta: dict[str, Any] | None,
    response_meta: dict[str, Any] | None,
) -> str:
    """插入一行用量事件，返回 id。"""
    pid = (provider_id or "").strip().lower()
    norm = normalize_llm_usage(pid, usage_meta, response_meta)
    pt, ct, tt, rt, cpt = _norm_columns(norm)
    eid = str(uuid.uuid4())
    row = LlmUsageEventRecord(
        id=eid,
        user_id=user_id,
        conversation_id=conversation_id,
        provider_id=pid,
        chat_model=(chat_model or "").strip() or None,
        graph_run_id=str(graph_run_id)[:128] if graph_run_id is not None else None,
        prompt_tokens=pt,
        completion_tokens=ct,
        total_tokens=tt,
        reasoning_tokens=rt,
        cached_prompt_tokens=cpt,
        usage_raw=usage_raw,
        usage_normalized=norm,
    )
    session.add(row)
    await session.flush()
    return eid

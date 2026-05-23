"""从 LangGraph/LangChain 流式 chunk 提取用量并组装 SSE 载荷。"""

from __future__ import annotations

import json
from typing import Any

from app.llm.billing.normalize import (
    normalize_llm_usage,
    sanitize_usage_for_json,
    usage_complete_enough_to_emit,
)


def _usage_sources_from_chunk(chunk: Any) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    """Internal helper: usage sources from chunk."""
    um = getattr(chunk, "usage_metadata", None)
    usage_meta = um if isinstance(um, dict) else None
    rm = getattr(chunk, "response_metadata", None)
    resp_meta = rm if isinstance(rm, dict) else None
    return usage_meta, resp_meta


def usage_sources_from_chunk(chunk: Any) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    """供持久化层读取 LangChain chunk 上的 metadata。"""
    return _usage_sources_from_chunk(chunk)


def merged_usage_dict(chunk: Any) -> dict[str, Any]:
    """合并 chunk 上的用量字段（含 response_metadata.usage）。"""
    usage_meta, resp_meta = _usage_sources_from_chunk(chunk)
    merged: dict[str, Any] = {}
    if isinstance(resp_meta, dict):
        ru = resp_meta.get("usage")
        if isinstance(ru, dict):
            merged.update(ru)
    if isinstance(usage_meta, dict):
        merged.update(usage_meta)
    details = merged.get("completion_tokens_details")
    if isinstance(details, dict):
        rt = details.get("reasoning_tokens")
        if rt is not None and "reasoning_tokens" not in merged:
            merged["reasoning_tokens"] = rt
    return merged


def chunk_usage_for_persist(chunk: Any) -> tuple[dict[str, Any], dict[str, Any] | None, dict[str, Any] | None]:
    """Chunk usage for persist (``chunk``)."""
    merged = merged_usage_dict(chunk)
    um, rm = _usage_sources_from_chunk(chunk)
    return merged, um, rm


def build_usage_emit_signature(run_id: str | None, merged: dict[str, Any]) -> str:
    """用于去重：同一 run_id + 相同用量快照只落库/SSE 一次。"""
    rid = str(run_id) if run_id is not None else ""
    try:
        keys = sorted(merged.keys())
        payload = {k: merged[k] for k in keys}
        return f"{rid}:{json.dumps(payload, sort_keys=True, default=str)}"
    except (TypeError, ValueError):
        return f"{rid}:{hash(str(merged))}"


def maybe_llm_usage_sse_payload(
    *,
    provider_id: str,
    graph_run_id: str | None,
    chat_model: str | None,
    chunk: Any,
) -> dict[str, Any] | None:
    """若 chunk 含完整用量则返回 SSE dict(type=llm-usage, ...)；否则 None。"""
    merged = merged_usage_dict(chunk)
    if not usage_complete_enough_to_emit(merged):
        return None
    usage_meta, resp_meta = _usage_sources_from_chunk(chunk)
    normalized = normalize_llm_usage(provider_id, usage_meta, resp_meta)
    raw_safe = sanitize_usage_for_json(merged)
    return {
        "type": "llm-usage",
        "provider": (provider_id or "").strip().lower(),
        "runId": str(graph_run_id) if graph_run_id is not None else None,
        "model": (chat_model or "").strip() or None,
        "usage": normalized,
        "usage_raw": raw_safe if isinstance(raw_safe, dict) else {},
    }

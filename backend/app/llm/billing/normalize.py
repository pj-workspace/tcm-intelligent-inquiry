"""将 LangChain / OpenAI 风格 usage 规范化为稳定 dict（SSE + DB）。"""

from __future__ import annotations

import json
import math
from typing import Any


def sanitize_usage_for_json(obj: Any, *, max_bytes: int = 16000) -> Any:
    """将用量对象变为可入库/下发的 JSON 结构，限制体积。"""
    try:
        s = json.dumps(obj, ensure_ascii=False, default=str)
    except (TypeError, ValueError):
        return {"unserializable": str(obj)[:2000]}
    if len(s) > max_bytes:
        return {"truncated": True, "preview": s[:max_bytes]}
    try:
        out = json.loads(s)
    except json.JSONDecodeError:
        return {"invalid_json_preview": s[:2000]}
    return out if isinstance(out, dict) else {"value": out}


def _as_int(v: Any) -> int | None:
    """Internal helper: as int."""
    if v is None:
        return None
    if isinstance(v, bool):
        return None
    if isinstance(v, int):
        return v if v >= 0 else None
    if isinstance(v, float) and not (math.isnan(v) or math.isinf(v)):
        return int(v) if v >= 0 else None
    if isinstance(v, str) and v.strip().isdigit():
        return int(v.strip())
    return None


def _pick_int(d: dict[str, Any], *keys: str) -> int | None:
    """Internal helper: pick int."""
    for k in keys:
        if k in d:
            n = _as_int(d.get(k))
            if n is not None:
                return n
    return None


def _merge_usage_sources(
    usage_metadata: dict[str, Any] | None,
    response_metadata: dict[str, Any] | None,
) -> dict[str, Any]:
    """合并 LangChain usage_metadata 与 OpenAI 风格 response_metadata['usage']。"""
    merged: dict[str, Any] = {}
    rm_usage = None
    if isinstance(response_metadata, dict):
        ru = response_metadata.get("usage")
        if isinstance(ru, dict):
            rm_usage = ru
    for part in (rm_usage, usage_metadata):
        if isinstance(part, dict):
            merged.update(part)
    details = merged.get("completion_tokens_details")
    if isinstance(details, dict):
        rt = details.get("reasoning_tokens")
        rn = _as_int(rt)
        if rn is not None and "reasoning_tokens" not in merged:
            merged["reasoning_tokens"] = rn
    return merged


def normalize_llm_usage(
    provider_id: str,
    usage_metadata: dict[str, Any] | None,
    response_metadata: dict[str, Any] | None,
) -> dict[str, Any]:
    """输出稳定的整数 token 字段子集（多厂商）；未知则不写入对应键。"""
    pid = (provider_id or "").strip().lower()
    raw_merged = _merge_usage_sources(usage_metadata, response_metadata)
    if not raw_merged:
        return {"provider_id": pid}

    prompt = _pick_int(raw_merged, "prompt_tokens", "input_tokens")
    completion = _pick_int(raw_merged, "completion_tokens", "output_tokens")
    total = _pick_int(raw_merged, "total_tokens")
    if total is None and prompt is not None and completion is not None:
        total = prompt + completion

    reasoning = _pick_int(raw_merged, "reasoning_tokens")
    cache_hit = _pick_int(raw_merged, "prompt_cache_hit_tokens")
    cache_miss = _pick_int(raw_merged, "prompt_cache_miss_tokens")
    cached_prompt = None
    if cache_hit is not None:
        cached_prompt = cache_hit

    out: dict[str, Any] = {"provider_id": pid}
    if prompt is not None:
        out["input_tokens"] = prompt
        out["prompt_tokens"] = prompt
    if completion is not None:
        out["output_tokens"] = completion
        out["completion_tokens"] = completion
    if total is not None:
        out["total_tokens"] = total
    if reasoning is not None:
        out["reasoning_tokens"] = reasoning
    if cached_prompt is not None:
        out["cached_prompt_tokens"] = cached_prompt
    # cache_miss 可供调试（不作为计费唯一口径）
    if cache_miss is not None:
        out["prompt_cache_miss_tokens"] = cache_miss
    return out


def usage_complete_enough_to_emit(raw_merged: dict[str, Any]) -> bool:
    """判断是否应将本条视为「终局用量」chunk（避免仅含 null 的中间块）。"""
    if not raw_merged:
        return False
    prompt = _pick_int(raw_merged, "prompt_tokens", "input_tokens")
    completion = _pick_int(raw_merged, "completion_tokens", "output_tokens")
    total = _pick_int(raw_merged, "total_tokens")
    if (
        prompt is not None
        and completion is not None
        and prompt == 0
        and completion == 0
        and (total is None or total == 0)
    ):
        return False
    if total is not None and total > 0:
        return True
    if prompt is not None and completion is not None:
        return prompt > 0 or completion > 0
    return False

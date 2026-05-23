"""请求级引用来源登记。

业务工具仍返回给模型可读的纯文本；同时在当前请求 context 中登记结构化
CitationSource，供 stream_chat 通过 SSE/持久化传给前端。这样前端只展示真实工具
产出的来源，不依赖模型自行生成 URL。
"""

from __future__ import annotations

from contextvars import ContextVar
from typing import Any, Literal, TypedDict


CitationKind = Literal["knowledge", "web", "formula", "external"]


class CitationSource(TypedDict, total=False):
    id: str
    kind: CitationKind
    title: str
    source: str
    url: str
    snippet: str
    score: float
    metadata: dict[str, Any]


_PREFIX_BY_KIND: dict[CitationKind, str] = {
    "knowledge": "K",
    "web": "W",
    "formula": "F",
    "external": "E",
}


_sources_ctx: ContextVar[list[CitationSource] | None] = ContextVar(
    "agent_citation_sources",
    default=None,
)
_counters_ctx: ContextVar[dict[str, int] | None] = ContextVar(
    "agent_citation_counters",
    default=None,
)


def reset_citation_sources() -> None:
    """重置当前请求的引用来源登记。"""
    _sources_ctx.set([])
    _counters_ctx.set({})


def citation_sources_snapshot() -> list[CitationSource]:
    """返回当前请求已登记来源的浅拷贝。"""
    return [dict(x) for x in (_sources_ctx.get() or [])]  # type: ignore[list-item]


def _next_source_id(kind: CitationKind) -> str:
    counters = _counters_ctx.get()
    if counters is None:
        counters = {}
        _counters_ctx.set(counters)
    prefix = _PREFIX_BY_KIND[kind]
    counters[prefix] = int(counters.get(prefix, 0)) + 1
    return f"{prefix}{counters[prefix]}"


def _clip(text: object, max_len: int) -> str:
    s = str(text or "").strip()
    return s if len(s) <= max_len else s[: max_len - 1] + "…"


def register_citation_source(
    *,
    kind: CitationKind,
    title: str,
    source: str | None = None,
    url: str | None = None,
    snippet: str | None = None,
    score: float | None = None,
    metadata: dict[str, Any] | None = None,
) -> CitationSource:
    """登记一个来源并返回其结构化信息。"""
    sources = _sources_ctx.get()
    if sources is None:
        sources = []
        _sources_ctx.set(sources)

    item: CitationSource = {
        "id": _next_source_id(kind),
        "kind": kind,
        "title": _clip(title, 240) or "未命名来源",
    }
    if source and source.strip():
        item["source"] = _clip(source, 240)
    if url and url.strip():
        item["url"] = _clip(url, 2048)
    if snippet and snippet.strip():
        item["snippet"] = _clip(snippet, 1200)
    if score is not None:
        try:
            item["score"] = float(score)
        except (TypeError, ValueError):
            pass
    if metadata:
        safe_meta: dict[str, Any] = {}
        for key, value in list(metadata.items())[:20]:
            if value is None:
                continue
            if isinstance(value, (str, int, float, bool)):
                safe_meta[str(key)[:80]] = value
            else:
                safe_meta[str(key)[:80]] = _clip(value, 500)
        if safe_meta:
            item["metadata"] = safe_meta
    sources.append(item)
    return item

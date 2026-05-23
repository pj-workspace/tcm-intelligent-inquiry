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
    """单条结构化引用来源，与前端 ``CitationSource`` 及 SSE ``sources`` 载荷对齐。

    ``id`` 由 ``register_citation_source`` 按 kind 分配（K/W/F/E + 序号），
    模型在最终答案中用 ``【K1】`` 等全角括号标记引用；前端据此渲染角标与来源面板。
    """

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


# 请求级隔离：同一 async 任务内工具并发登记，stream_chat 在 tool-result / flush 时快照。
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
    """按 kind 前缀递增计数并生成分配 id（如 K1、W2）。"""
    counters = _counters_ctx.get()
    if counters is None:
        counters = {}
        _counters_ctx.set(counters)
    prefix = _PREFIX_BY_KIND[kind]
    counters[prefix] = int(counters.get(prefix, 0)) + 1
    return f"{prefix}{counters[prefix]}"


def _clip(text: object, max_len: int) -> str:
    """截断字符串并追加省略号，防止 SSE/DB 字段过大。"""
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
    """登记一个来源并返回其结构化信息。

    字段会截断以防 JSON 列/SSE 过大；``metadata`` 仅保留可 JSON 序列化的标量或
    短字符串，避免工具内部对象泄漏到前端。

    Args:
        kind: 来源类别，决定 id 前缀（K/W/F/E）。
        title: 展示标题；空则回退为「未命名来源」。
        source: 可选副标题（书名、站点名等）。
        url: 可选外链；知识库片段通常无 url。
        snippet: 可选摘要，供 HoverCard / 来源面板展示。
        score: 可选检索分数（向量/重排）。
        metadata: 可选扩展键值；最多 20 项，值非 JSON 原生类型时转为截断字符串。

    Returns:
        已 append 到当前请求登记表的条目（含分配的 ``id``）。
    """
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
        # 限制条目数与值类型：metadata 会进入 DB JSON 与 SSE，不可信任工具传入的任意对象。
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

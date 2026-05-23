"""检索结果重排序（DashScope gte-rerank）。"""

from __future__ import annotations

import asyncio
from http import HTTPStatus

from dashscope import TextReRank
from langchain_core.documents import Document

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)


async def rerank_document_pairs(
    query: str,
    pairs: list[tuple[Document, float]],
    top_k: int,
) -> list[tuple[Document, float]]:
    """对向量检索候选做重排序，返回 top_k 条（分数为 relevance_score）。"""
    if not pairs or top_k <= 0:
        return []
    if len(pairs) <= top_k:
        return list(pairs)[:top_k]

    s = get_settings()
    key = (s.dashscope_api_key or "").strip()
    if not key:
        logger.warning("未配置 DASHSCOPE_API_KEY，跳过重排序")
        return pairs[:top_k]

    model = (s.dashscope_rerank_model or "gte-rerank").strip()
    texts = [d.page_content for d, _ in pairs]

    def _call_sync():
        """Internal helper: call sync."""
        return TextReRank.call(
            model=model,
            query=query,
            documents=texts,
            top_n=min(top_k, len(texts)),
            api_key=key,
        )

    try:
        resp = await asyncio.to_thread(_call_sync)
    except Exception as exc:
        logger.warning("重排序请求异常，回退向量序: %s", exc)
        return pairs[:top_k]

    if resp.status_code != HTTPStatus.OK or not getattr(resp, "output", None):
        logger.warning(
            "重排序失败 status=%s msg=%s，回退向量序",
            getattr(resp, "status_code", None),
            getattr(resp, "message", None),
        )
        return pairs[:top_k]

    results = resp.output.results
    if not results:
        return pairs[:top_k]

    out: list[tuple[Document, float]] = []
    for r in results[:top_k]:
        idx = r.index
        if 0 <= idx < len(pairs):
            doc = pairs[idx][0]
            score = float(r.relevance_score)
            out.append((doc, score))
    if not out:
        return pairs[:top_k]
    return out

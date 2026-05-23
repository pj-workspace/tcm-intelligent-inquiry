"""Qdrant 向量库适配器。

每个知识库对应一个 collection，命名：`kb_<uuid>`（连字符替换为下划线）。
"""

from collections.abc import Awaitable, Callable
from functools import lru_cache

from langchain_core.documents import Document
from langchain_qdrant import QdrantVectorStore
from qdrant_client import QdrantClient
from qdrant_client.http import models as qmodels

from app.core.config import get_settings
from app.core.logging import get_logger
from app.llm.registry import get_embeddings

logger = get_logger(__name__)


class VectorStoreUnavailable(Exception):
    """Qdrant 不可用或检索/写入失败的统一异常。

    与"集合不存在"语义区分：集合不存在视为"知识库为空"，由调用方返回空结果；
    其它真实故障（连接失败、协议错误等）以本异常向上抛出，由上层转换为友好提示。
    """


@lru_cache(maxsize=8)
def _qdrant_client_for_url(qdrant_url: str) -> QdrantClient:
    """Internal helper: qdrant client for url."""
    # 与 docker 内 Qdrant 主版本可能不一致时仅告警，不阻断
    return QdrantClient(url=qdrant_url, check_compatibility=False)


def _qdrant_client() -> QdrantClient:
    """Internal helper: qdrant client."""
    return _qdrant_client_for_url(get_settings().qdrant_url)


def _collection_name(kb_id: str) -> str:
    """Internal helper: collection name."""
    return f"kb_{kb_id.replace('-', '_')}"


def _vector_store(kb_id: str) -> QdrantVectorStore:
    """Internal helper: vector store."""
    # 首次入库前 collection 可能尚未创建，关闭启动时校验
    return QdrantVectorStore(
        client=_qdrant_client(),
        collection_name=_collection_name(kb_id),
        embedding=get_embeddings(),
        validate_collection_config=False,
    )


def _ensure_collection(kb_id: str) -> None:
    """若 Qdrant 中尚无该知识库 collection，则按当前嵌入维度创建（Cosine）。"""
    client = _qdrant_client()
    name = _collection_name(kb_id)
    if client.collection_exists(collection_name=name):
        return
    emb = get_embeddings()
    dim = len(emb.embed_query("ping"))
    client.create_collection(
        collection_name=name,
        vectors_config=qmodels.VectorParams(size=dim, distance=qmodels.Distance.COSINE),
    )
    logger.info("qdrant created collection=%s dim=%s", name, dim)


async def upsert_documents(
    kb_id: str,
    documents: list[Document],
    progress_cb: Callable[[int], Awaitable[None]] | None = None,
    batch_size: int = 50,
) -> int:
    """写入分块文档。progress_cb 接收 0-100 的整数进度（仅嵌入+写入阶段）。"""
    if not documents:
        return 0
    _ensure_collection(kb_id)
    store = _vector_store(kb_id)
    total = len(documents)
    done = 0
    for i in range(0, total, batch_size):
        batch = documents[i : i + batch_size]
        await store.aadd_documents(batch)
        done += len(batch)
        if progress_cb is not None:
            pct = int(done / total * 100)
            await progress_cb(pct)
    logger.info("qdrant upsert kb_id=%s chunks=%d", kb_id, total)
    return total


async def similarity_search(
    kb_id: str, query: str, top_k: int = 5
) -> list[tuple[Document, float]]:
    """语义检索，返回 (Document, score)。

    - collection 不存在时返回 []（视为"知识库为空"，不应抛错打断流程）；
    - 其它异常统一封装为 :class:`VectorStoreUnavailable` 抛出，由上层决定降级或提示。
    """
    name = _collection_name(kb_id)
    client = _qdrant_client()
    try:
        exists = client.collection_exists(collection_name=name)
    except Exception as exc:
        logger.warning("qdrant connectivity error kb_id=%s: %s", kb_id, exc)
        raise VectorStoreUnavailable(f"向量库连接失败：{exc}") from exc
    if not exists:
        logger.debug("qdrant collection absent, treat as empty: %s", name)
        return []

    store = _vector_store(kb_id)
    try:
        pairs = await store.asimilarity_search_with_score(query, k=top_k)
    except Exception as exc:
        logger.warning("qdrant search kb_id=%s: %s", kb_id, exc)
        raise VectorStoreUnavailable(f"向量检索失败：{exc}") from exc
    return pairs


async def delete_kb_vectors(kb_id: str) -> None:
    """删除知识库对应的 Qdrant collection。"""
    name = _collection_name(kb_id)
    client = _qdrant_client()
    if not client.collection_exists(collection_name=name):
        logger.debug("qdrant collection absent, skip: %s", name)
        return
    client.delete_collection(collection_name=name)
    logger.info("qdrant deleted collection=%s", name)


async def delete_document_vectors(kb_id: str, doc_id: str) -> None:
    """按 `metadata.kb_doc_id` 过滤删除单个文档对应的所有向量分块。

    底层走 Qdrant 的过滤删除（FilterSelector）；若 collection 不存在直接跳过。
    """
    name = _collection_name(kb_id)
    client = _qdrant_client()
    if not client.collection_exists(collection_name=name):
        logger.debug("qdrant collection absent, skip doc delete: %s", name)
        return
    flt = qmodels.Filter(
        must=[
            qmodels.FieldCondition(
                key="metadata.kb_doc_id",
                match=qmodels.MatchValue(value=doc_id),
            )
        ]
    )
    client.delete(
        collection_name=name,
        points_selector=qmodels.FilterSelector(filter=flt),
    )
    logger.info("qdrant deleted doc vectors kb_id=%s doc_id=%s", kb_id, doc_id)

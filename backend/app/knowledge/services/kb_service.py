"""知识库管理服务：元数据存 PostgreSQL，向量存 Qdrant。"""

import uuid
from collections.abc import Awaitable, Callable

from langchain_core.documents import Document
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.core.logging import get_logger
from app.knowledge.ingest.chunker import chunk_documents
from app.knowledge.ingest.document_text import extract_plain_text
from app.knowledge.models import KnowledgeBaseRecord, KnowledgeDocumentRecord
from app.knowledge.schemas import (
    IngestResponse,
    KnowledgeBaseCreateRequest,
    KnowledgeBaseListResponse,
    KnowledgeBaseResponse,
    KnowledgeBaseUpdateRequest,
    KnowledgeDocumentListResponse,
    KnowledgeDocumentResponse,
    SearchRequest,
    SearchResponse,
    SearchResult,
)
from app.knowledge.search.retrieval import retrieve_kb_chunks
from app.knowledge.search.vectorstore import (
    delete_document_vectors,
    delete_kb_vectors,
    upsert_documents,
)

logger = get_logger(__name__)


def _doc_record_to_response(row: KnowledgeDocumentRecord) -> KnowledgeDocumentResponse:
    """Internal helper: doc record to response."""
    return KnowledgeDocumentResponse(
        id=row.id,
        kb_id=row.kb_id,
        filename=row.filename,
        chunk_count=int(row.chunk_count or 0),
        file_size=int(row.file_size or 0),
        created_at=row.created_at.isoformat() if row.created_at else "",
    )


def _current_embedding_info() -> tuple[str, str, int]:
    """探测当前进程的嵌入厂商/模型/维度，作为知识库的指纹。

    返回元组 ``(provider, model, dim)``；调用 ``embed_query("ping")`` 真实读取维度。
    """
    from app.core.config import get_settings
    from app.llm.registry import get_embeddings, resolved_embedding_provider

    s = get_settings()
    provider = resolved_embedding_provider()
    if provider == "qwen":
        model = s.qwen_embedding_model
    elif provider == "openai":
        model = s.openai_embedding_model
    else:
        model = "unknown"
    dim = len(get_embeddings().embed_query("ping"))
    return provider, model, dim


class KnowledgeService:
    """Knowledge Service."""
    def __init__(self, session: AsyncSession):
        """Initialize instance."""
        self._session = session

    # ── 内部工具：组装响应 ────────────────────────────────────────────────────
    async def _count_documents(self, kb_id: str) -> int:
        """Internal helper: count documents."""
        stmt = select(func.count(KnowledgeDocumentRecord.id)).where(
            KnowledgeDocumentRecord.kb_id == kb_id
        )
        result = await self._session.execute(stmt)
        return int(result.scalar_one() or 0)

    def _build_response(
        self,
        row: KnowledgeBaseRecord,
        document_count: int,
        total_chunks: int = 0,
    ) -> KnowledgeBaseResponse:
        """Internal helper: _build_response."""
        return KnowledgeBaseResponse(
            id=row.id,
            owner_id=row.owner_id,
            name=row.name,
            description=row.description or "",
            document_count=int(document_count),
            embedding_provider=row.embedding_provider,
            embedding_model=row.embedding_model,
            embedding_dim=row.embedding_dim,
            metadata={},
            total_chunks=total_chunks,
        )

    async def _sum_chunks(self, kb_id: str) -> int:
        """Internal helper: sum chunks."""
        stmt = select(func.sum(KnowledgeDocumentRecord.chunk_count)).where(
            KnowledgeDocumentRecord.kb_id == kb_id
        )
        result = await self._session.execute(stmt)
        return int(result.scalar_one() or 0)

    async def _row_to_response(self, row: KnowledgeBaseRecord) -> KnowledgeBaseResponse:
        """Internal helper: row to response."""
        doc_count = await self._count_documents(row.id)
        total_chunks = await self._sum_chunks(row.id)
        return self._build_response(row, doc_count, total_chunks)

    # ── KB CRUD ───────────────────────────────────────────────────────────────
    async def list_kbs(self, owner_id: str) -> KnowledgeBaseListResponse:
        """List kbs (``owner_id``)."""
        stmt = (
            select(KnowledgeBaseRecord)
            .where(KnowledgeBaseRecord.owner_id == owner_id)
            .order_by(KnowledgeBaseRecord.name)
        )
        result = await self._session.execute(stmt)
        rows = result.scalars().all()
        if not rows:
            return KnowledgeBaseListResponse(knowledge_bases=[], total=0)

        ids = [r.id for r in rows]
        count_stmt = (
            select(KnowledgeDocumentRecord.kb_id, func.count(KnowledgeDocumentRecord.id))
            .where(KnowledgeDocumentRecord.kb_id.in_(ids))
            .group_by(KnowledgeDocumentRecord.kb_id)
        )
        count_rows = (await self._session.execute(count_stmt)).all()
        counts: dict[str, int] = {kb_id: int(n or 0) for kb_id, n in count_rows}

        chunks_stmt = (
            select(KnowledgeDocumentRecord.kb_id, func.sum(KnowledgeDocumentRecord.chunk_count))
            .where(KnowledgeDocumentRecord.kb_id.in_(ids))
            .group_by(KnowledgeDocumentRecord.kb_id)
        )
        chunks_rows = (await self._session.execute(chunks_stmt)).all()
        total_chunks_map: dict[str, int] = {kb_id: int(n or 0) for kb_id, n in chunks_rows}

        return KnowledgeBaseListResponse(
            knowledge_bases=[
                self._build_response(r, counts.get(r.id, 0), total_chunks_map.get(r.id, 0))
                for r in rows
            ],
            total=len(rows),
        )

    async def get_kb(self, kb_id: str, owner_id: str) -> KnowledgeBaseResponse:
        """Get kb (``kb_id``, ``owner_id``)."""
        row = await self._session.get(KnowledgeBaseRecord, kb_id)
        if row is None or row.owner_id != owner_id:
            raise NotFoundError(f"知识库 '{kb_id}' 不存在")
        return await self._row_to_response(row)

    async def create_kb(
        self, req: KnowledgeBaseCreateRequest, owner_id: str
    ) -> KnowledgeBaseResponse:
        """Create kb。"""
        kb_id = str(uuid.uuid4())
        row = KnowledgeBaseRecord(
            id=kb_id,
            owner_id=owner_id,
            name=req.name,
            description=req.description or "",
            document_count=0,
        )
        self._session.add(row)
        await self._session.flush()
        logger.info("创建知识库 id=%s name=%s owner=%s", kb_id, req.name, owner_id)
        return self._build_response(row, 0)

    async def update_kb(
        self,
        kb_id: str,
        req: KnowledgeBaseUpdateRequest,
        owner_id: str,
    ) -> KnowledgeBaseResponse:
        """Update kb。"""
        row = await self._session.get(KnowledgeBaseRecord, kb_id)
        if row is None or row.owner_id != owner_id:
            raise NotFoundError(f"知识库 '{kb_id}' 不存在")
        if req.name is not None:
            row.name = req.name
        if req.description is not None:
            row.description = req.description
        await self._session.flush()
        logger.info("更新知识库 id=%s name=%s", kb_id, row.name)
        return await self._row_to_response(row)

    async def delete_kb(self, kb_id: str, owner_id: str) -> None:
        """Delete kb (``kb_id``, ``owner_id``)."""
        row = await self._session.get(KnowledgeBaseRecord, kb_id)
        if row is None or row.owner_id != owner_id:
            raise NotFoundError(f"知识库 '{kb_id}' 不存在")
        # 先删 Qdrant collection；PostgreSQL 中的 kb_documents 关联记录由 FK CASCADE 自动清理
        await delete_kb_vectors(kb_id)
        await self._session.delete(row)
        logger.info("删除知识库 id=%s", kb_id)

    # ── 文档管理 ─────────────────────────────────────────────────────────────
    async def list_documents(
        self, kb_id: str, owner_id: str
    ) -> KnowledgeDocumentListResponse:
        """List documents。"""
        kb = await self._session.get(KnowledgeBaseRecord, kb_id)
        if kb is None or kb.owner_id != owner_id:
            raise NotFoundError(f"知识库 '{kb_id}' 不存在")
        stmt = (
            select(KnowledgeDocumentRecord)
            .where(KnowledgeDocumentRecord.kb_id == kb_id)
            .order_by(KnowledgeDocumentRecord.created_at.desc())
        )
        rows = (await self._session.execute(stmt)).scalars().all()
        return KnowledgeDocumentListResponse(
            documents=[_doc_record_to_response(r) for r in rows],
            total=len(rows),
        )

    async def delete_document(
        self,
        kb_id: str,
        doc_id: str,
        owner_id: str,
    ) -> None:
        """Delete document。"""
        kb = await self._session.get(KnowledgeBaseRecord, kb_id)
        if kb is None or kb.owner_id != owner_id:
            raise NotFoundError(f"知识库 '{kb_id}' 不存在")
        doc = await self._session.get(KnowledgeDocumentRecord, doc_id)
        if doc is None or doc.kb_id != kb_id:
            raise NotFoundError(f"文档 '{doc_id}' 不存在或不属于该知识库")

        # 先按 kb_doc_id 过滤删除 Qdrant 中的所有分块向量，再清除 PG 元数据
        await delete_document_vectors(kb_id, doc_id)
        await self._session.execute(
            delete(KnowledgeDocumentRecord).where(KnowledgeDocumentRecord.id == doc_id)
        )
        logger.info("删除知识库文档 kb_id=%s doc_id=%s", kb_id, doc_id)

    # ── 入库 / 检索 ──────────────────────────────────────────────────────────
    async def ingest_file(
        self,
        kb_id: str,
        filename: str,
        content: bytes,
        owner_id: str,
        progress_cb: Callable[[str, int], Awaitable[None]] | None = None,
    ) -> IngestResponse:
        """Ingest file。"""
        row = await self._session.get(KnowledgeBaseRecord, kb_id)
        if row is None or row.owner_id != owner_id:
            raise NotFoundError(f"知识库 '{kb_id}' 不存在")

        # 嵌入指纹：首次入库写入；非首次入库须与当前配置完全一致
        provider, model, dim = _current_embedding_info()
        if row.embedding_provider or row.embedding_model or row.embedding_dim:
            stored = (
                row.embedding_provider or "?",
                row.embedding_model or "?",
                int(row.embedding_dim or 0),
            )
            current = (provider, model, dim)
            if stored != current:
                raise ValidationError(
                    f"知识库使用 {stored[0]}/{stored[1]}（dim={stored[2]}）嵌入模型创建，"
                    f"当前配置为 {current[0]}/{current[1]}（dim={current[2]}），"
                    "请恢复一致或新建知识库。"
                )
        else:
            row.embedding_provider = provider
            row.embedding_model = model
            row.embedding_dim = int(dim)

        # 指纹校验完成，开始文本提取阶段
        if progress_cb is not None:
            await progress_cb("extracting", 5)

        # 检查同 KB 内是否已存在同名文档
        existing_doc_stmt = select(KnowledgeDocumentRecord).where(
            KnowledgeDocumentRecord.kb_id == kb_id,
            KnowledgeDocumentRecord.filename == filename,
        )
        existing_doc = (await self._session.execute(existing_doc_stmt)).scalars().first()
        if existing_doc is not None:
            # 先删除旧向量，再删除旧记录（覆盖语义）
            await delete_document_vectors(kb_id, existing_doc.id)
            await self._session.execute(
                delete(KnowledgeDocumentRecord).where(KnowledgeDocumentRecord.id == existing_doc.id)
            )
            await self._session.flush()
            logger.info("覆盖同名文档 kb_id=%s filename=%s old_doc_id=%s", kb_id, filename, existing_doc.id)

        text = extract_plain_text(filename, content)

        # 文本提取完成，进入分块阶段
        if progress_cb is not None:
            await progress_cb("chunking", 15)

        # 先创建文档记录拿到 doc_id，再把它注入到每个 chunk 的 metadata
        doc_id = str(uuid.uuid4())
        doc_record = KnowledgeDocumentRecord(
            id=doc_id,
            kb_id=kb_id,
            filename=filename,
            chunk_count=0,
            file_size=len(content),
        )
        self._session.add(doc_record)
        await self._session.flush()

        raw_docs = [
            Document(
                page_content=text,
                metadata={"source": filename, "kb_doc_id": doc_id},
            )
        ]
        chunks = chunk_documents(raw_docs)
        for ch in chunks:
            ch.metadata.setdefault("source", filename)
            ch.metadata["kb_doc_id"] = doc_id

        # 分块完成，进入嵌入向量化阶段
        if progress_cb is not None:
            await progress_cb("embedding", 20)

        async def _emb_progress(pct: int) -> None:
            """Internal helper: emb progress."""
            if progress_cb is not None:
                # 将嵌入阶段 0-100 映射到整体进度 20-85
                mapped = 20 + int(pct * 0.65)
                await progress_cb("embedding", mapped)

        try:
            count = await upsert_documents(kb_id, chunks, progress_cb=_emb_progress)
        except Exception:
            # 写入向量失败：回滚 PG 中的文档记录，避免出现孤立的元数据行
            await self._session.execute(
                delete(KnowledgeDocumentRecord).where(KnowledgeDocumentRecord.id == doc_id)
            )
            raise

        # 向量写入完成
        if progress_cb is not None:
            await progress_cb("writing", 90)

        doc_record.chunk_count = int(count)
        await self._session.flush()

        # 全部完成
        if progress_cb is not None:
            await progress_cb("done", 100)

        return IngestResponse(
            kb_id=kb_id,
            filename=filename,
            chunk_count=count,
            message=f"成功写入 Qdrant {count} 个向量分块",
        )

    async def search(
        self, kb_id: str, req: SearchRequest, owner_id: str
    ) -> SearchResponse:
        """Search。"""
        row = await self._session.get(KnowledgeBaseRecord, kb_id)
        if row is None or row.owner_id != owner_id:
            raise NotFoundError(f"知识库 '{kb_id}' 不存在")

        raw = await retrieve_kb_chunks(kb_id, req.query, req.top_k)
        results = [
            SearchResult(
                content=doc.page_content,
                source=str(doc.metadata.get("source", "")),
                score=float(score),
            )
            for doc, score in raw
        ]
        return SearchResponse(results=results, query=req.query)

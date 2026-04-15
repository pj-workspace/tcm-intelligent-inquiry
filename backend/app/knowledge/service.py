"""知识库管理服务：元数据存 PostgreSQL，向量存 Qdrant。"""

import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.core.logging import get_logger
from app.knowledge.chunker import chunk_documents
from app.knowledge.document_text import extract_plain_text
from app.knowledge.models import KnowledgeBaseRecord
from app.knowledge.schemas import (
    IngestResponse,
    KnowledgeBaseCreateRequest,
    KnowledgeBaseListResponse,
    KnowledgeBaseResponse,
    SearchRequest,
    SearchResponse,
    SearchResult,
)
from app.knowledge.retrieval import retrieve_kb_chunks
from app.knowledge.vectorstore import (
    delete_kb_vectors,
    upsert_documents,
)
from langchain_core.documents import Document

logger = get_logger(__name__)


def _row_to_response(row: KnowledgeBaseRecord) -> KnowledgeBaseResponse:
    return KnowledgeBaseResponse(
        id=row.id,
        owner_id=row.owner_id,
        name=row.name,
        description=row.description or "",
        document_count=row.document_count,
        metadata={},
    )


class KnowledgeService:
    def __init__(self, session: AsyncSession):
        self._session = session

    async def list_kbs(self, owner_id: str) -> KnowledgeBaseListResponse:
        stmt = (
            select(KnowledgeBaseRecord)
            .where(KnowledgeBaseRecord.owner_id == owner_id)
            .order_by(KnowledgeBaseRecord.name)
        )
        result = await self._session.execute(stmt)
        rows = result.scalars().all()
        return KnowledgeBaseListResponse(
            knowledge_bases=[_row_to_response(r) for r in rows],
            total=len(rows),
        )

    async def get_kb(self, kb_id: str, owner_id: str) -> KnowledgeBaseResponse:
        row = await self._session.get(KnowledgeBaseRecord, kb_id)
        if row is None or row.owner_id != owner_id:
            raise NotFoundError(f"知识库 '{kb_id}' 不存在")
        return _row_to_response(row)

    async def create_kb(self, req: KnowledgeBaseCreateRequest, owner_id: str) -> KnowledgeBaseResponse:
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
        return _row_to_response(row)

    async def delete_kb(self, kb_id: str, owner_id: str) -> None:
        row = await self._session.get(KnowledgeBaseRecord, kb_id)
        if row is None or row.owner_id != owner_id:
            raise NotFoundError(f"知识库 '{kb_id}' 不存在")
        await delete_kb_vectors(kb_id)
        self._session.delete(row)
        logger.info("删除知识库 id=%s", kb_id)

    async def ingest_file(
        self,
        kb_id: str,
        filename: str,
        content: bytes,
        owner_id: str,
    ) -> IngestResponse:
        row = await self._session.get(KnowledgeBaseRecord, kb_id)
        if row is None or row.owner_id != owner_id:
            raise NotFoundError(f"知识库 '{kb_id}' 不存在")

        text = extract_plain_text(filename, content)
        raw_docs = [Document(page_content=text, metadata={"source": filename})]
        chunks = chunk_documents(raw_docs)

        count = await upsert_documents(kb_id, chunks)
        row.document_count += 1

        return IngestResponse(
            kb_id=kb_id,
            filename=filename,
            chunk_count=count,
            message=f"成功写入 Qdrant {count} 个向量分块",
        )

    async def search(self, kb_id: str, req: SearchRequest, owner_id: str) -> SearchResponse:
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

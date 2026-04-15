"""知识库管理 API 的请求/响应模型。"""

from typing import Any

from pydantic import BaseModel, Field


class DocumentMetadata(BaseModel):
    source: str = Field(..., description="原始文件名或来源标识")
    chunk_count: int = Field(default=0, description="已索引分块数量")


class KnowledgeBaseResponse(BaseModel):
    id: str
    name: str
    description: str
    document_count: int
    metadata: dict = Field(default_factory=dict)


class KnowledgeBaseCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, description="知识库名称")
    description: str = Field(default="", description="知识库说明")


class KnowledgeBaseListResponse(BaseModel):
    knowledge_bases: list[KnowledgeBaseResponse]
    total: int


class IngestResponse(BaseModel):
    kb_id: str
    filename: str
    chunk_count: int
    message: str


class IngestJobCreateResponse(BaseModel):
    job_id: str
    status: str = "pending"
    celery_task_id: str | None = Field(
        default=None,
        description="Celery 任务 ID（仅 celery_ingest_enabled=true 时有值）",
    )


class IngestJobStatusResponse(BaseModel):
    job_id: str
    status: str
    result: dict[str, Any] | None = None
    error: str | None = None


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, description="检索问题")
    top_k: int = Field(default=5, ge=1, le=20, description="返回片段数量")


class SearchResult(BaseModel):
    content: str
    source: str
    score: float


class SearchResponse(BaseModel):
    results: list[SearchResult]
    query: str

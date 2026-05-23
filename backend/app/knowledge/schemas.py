"""知识库管理 API 的请求/响应模型。"""

from typing import Any

from pydantic import BaseModel, Field


class DocumentMetadata(BaseModel):
    """Document Metadata."""
    source: str = Field(..., description="原始文件名或来源标识")
    chunk_count: int = Field(default=0, description="已索引分块数量")


class KnowledgeBaseResponse(BaseModel):
    """Knowledge Base Response data model."""
    id: str
    owner_id: str = Field(..., description="所属用户 ID")
    name: str
    description: str
    document_count: int
    embedding_provider: str | None = Field(
        default=None,
        description="知识库首次入库时记录的嵌入厂商，例如 qwen / openai；老库可能为空",
    )
    embedding_model: str | None = Field(
        default=None,
        description="知识库首次入库时记录的嵌入模型名；老库可能为空",
    )
    embedding_dim: int | None = Field(
        default=None,
        description="知识库首次入库时记录的向量维度；老库可能为空",
    )
    metadata: dict = Field(default_factory=dict)
    total_chunks: int = Field(
        default=0,
        description="知识库内所有文档的向量分块总数（document chunk_count 之和）",
    )


class KnowledgeBaseCreateRequest(BaseModel):
    """Knowledge Base Create Request."""
    name: str = Field(..., min_length=1, description="知识库名称")
    description: str = Field(default="", description="知识库说明")


class KnowledgeBaseUpdateRequest(BaseModel):
    """部分更新知识库元数据；仅传入字段会被写入。"""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)


class KnowledgeBaseListResponse(BaseModel):
    """Knowledge Base List Response data model."""
    knowledge_bases: list[KnowledgeBaseResponse]
    total: int


class IngestResponse(BaseModel):
    """Ingest Response data model."""
    kb_id: str
    filename: str
    chunk_count: int
    message: str


class IngestJobCreateResponse(BaseModel):
    """Ingest Job Create Response data model."""
    job_id: str
    status: str = "pending"
    celery_task_id: str | None = Field(
        default=None,
        description="Celery 任务 ID（仅 celery_ingest_enabled=true 时有值）",
    )


class IngestJobStatusResponse(BaseModel):
    """Ingest Job Status Response data model."""
    job_id: str
    status: str
    phase: str | None = Field(
        default=None,
        description="当前处理阶段：extracting / chunking / embedding / writing / done",
    )
    progress: int | None = Field(
        default=None,
        ge=0,
        le=100,
        description="服务端处理进度（0-100），仅 status=running 时有意义",
    )
    result: dict[str, Any] | None = None
    error: str | None = None


class SearchRequest(BaseModel):
    """Search Request."""
    query: str = Field(..., min_length=1, description="检索问题")
    top_k: int = Field(default=5, ge=1, le=20, description="返回片段数量")


class SearchResult(BaseModel):
    """Search Result."""
    content: str
    source: str
    score: float = Field(
        ...,
        description="相关度分数：开启重排时为模型相关分（通常越大越好）；仅向量时为距离/相似度（依 Qdrant 度量）",
    )


class SearchResponse(BaseModel):
    """Search Response data model."""
    results: list[SearchResult]
    query: str


class KnowledgeDocumentResponse(BaseModel):
    """单个已入库文档的元数据视图。"""

    id: str
    kb_id: str
    filename: str
    chunk_count: int
    file_size: int
    created_at: str = Field(..., description="ISO8601 时间字符串")


class KnowledgeDocumentListResponse(BaseModel):
    """Knowledge Document List Response data model."""
    documents: list[KnowledgeDocumentResponse]
    total: int

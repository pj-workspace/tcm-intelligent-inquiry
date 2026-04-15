"""知识库管理路由。"""

from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import UserRecord
from app.core.config import get_settings
from app.core.database import get_session
from app.core.exceptions import NotFoundError
from app.knowledge.deps import require_kb_user
from app.knowledge.job_store import (
    job_create,
    job_get,
    job_update,
    run_ingest_background,
    stash_ingest_blob,
    stash_ingest_to_disk,
)
from app.knowledge.schemas import (
    IngestJobCreateResponse,
    IngestJobStatusResponse,
    IngestResponse,
    KnowledgeBaseCreateRequest,
    KnowledgeBaseListResponse,
    KnowledgeBaseResponse,
    SearchRequest,
    SearchResponse,
)
from app.knowledge.service import KnowledgeService

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


def _svc(session: AsyncSession = Depends(get_session)) -> KnowledgeService:
    return KnowledgeService(session)


async def _read_upload_limited(file: UploadFile) -> bytes:
    content = await file.read()
    m = get_settings().max_upload_bytes
    if len(content) > m:
        raise HTTPException(
            status_code=413,
            detail=f"文件超过大小限制（最大 {m} 字节）",
        )
    return content


@router.get(
    "/jobs/{job_id}",
    response_model=IngestJobStatusResponse,
    summary="查询异步入库任务状态",
)
async def get_ingest_job(
    job_id: str,
    user: Annotated[UserRecord, Depends(require_kb_user)],
):
    data = await job_get(job_id, owner_id=user.id)
    if data is None:
        raise NotFoundError(f"任务 '{job_id}' 不存在或已过期")
    return IngestJobStatusResponse(
        job_id=data.get("job_id", job_id),
        status=data.get("status", "unknown"),
        result=data.get("result"),
        error=data.get("error"),
    )


@router.get("", response_model=KnowledgeBaseListResponse, summary="列出当前用户的知识库")
async def list_kbs(
    user: Annotated[UserRecord, Depends(require_kb_user)],
    svc: KnowledgeService = Depends(_svc),
):
    return await svc.list_kbs(user.id)


@router.post("", response_model=KnowledgeBaseResponse, summary="创建知识库")
async def create_kb(
    req: KnowledgeBaseCreateRequest,
    user: Annotated[UserRecord, Depends(require_kb_user)],
    svc: KnowledgeService = Depends(_svc),
):
    return await svc.create_kb(req, user.id)


@router.get("/{kb_id}", response_model=KnowledgeBaseResponse, summary="获取知识库详情")
async def get_kb(
    kb_id: str,
    user: Annotated[UserRecord, Depends(require_kb_user)],
    svc: KnowledgeService = Depends(_svc),
):
    return await svc.get_kb(kb_id, user.id)


@router.delete("/{kb_id}", status_code=204, summary="删除知识库")
async def remove_kb(
    kb_id: str,
    user: Annotated[UserRecord, Depends(require_kb_user)],
    svc: KnowledgeService = Depends(_svc),
):
    await svc.delete_kb(kb_id, user.id)


@router.post("/{kb_id}/ingest", response_model=IngestResponse, summary="上传文档入库（同步）")
async def ingest(
    kb_id: str,
    file: UploadFile,
    user: Annotated[UserRecord, Depends(require_kb_user)],
    svc: KnowledgeService = Depends(_svc),
):
    content = await _read_upload_limited(file)
    return await svc.ingest_file(kb_id, file.filename or "unknown", content, user.id)


@router.post(
    "/{kb_id}/ingest-async",
    response_model=IngestJobCreateResponse,
    summary="上传文档异步入库（大文件推荐，轮询 /api/knowledge/jobs/{job_id}）",
)
async def ingest_async(
    kb_id: str,
    file: UploadFile,
    background_tasks: BackgroundTasks,
    user: Annotated[UserRecord, Depends(require_kb_user)],
    svc: KnowledgeService = Depends(_svc),
):
    await svc.get_kb(kb_id, user.id)
    content = await _read_upload_limited(file)
    job_id = await job_create(owner_id=user.id)
    filename = file.filename or "unknown"
    settings = get_settings()
    if settings.celery_ingest_enabled:
        await stash_ingest_to_disk(job_id, content, filename)
        from app.workers.tasks import ingest_document_task

        async_result = ingest_document_task.delay(job_id, kb_id, filename)
        await job_update(job_id, celery_task_id=async_result.id)
        return IngestJobCreateResponse(
            job_id=job_id, status="pending", celery_task_id=async_result.id
        )
    await stash_ingest_blob(job_id, content)
    background_tasks.add_task(
        run_ingest_background,
        job_id,
        kb_id,
        filename,
        content,
        user.id,
    )
    return IngestJobCreateResponse(job_id=job_id, status="pending")


@router.post("/{kb_id}/search", response_model=SearchResponse, summary="知识库语义检索")
async def search(
    kb_id: str,
    req: SearchRequest,
    user: Annotated[UserRecord, Depends(require_kb_user)],
    svc: KnowledgeService = Depends(_svc),
):
    return await svc.search(kb_id, req, user.id)

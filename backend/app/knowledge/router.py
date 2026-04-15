"""知识库管理路由。"""

from fastapi import APIRouter, BackgroundTasks, Depends, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_session
from app.core.exceptions import NotFoundError
from app.knowledge.job_store import job_create, job_get, job_update, run_ingest_background, stash_ingest_blob
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


@router.get(
    "/jobs/{job_id}",
    response_model=IngestJobStatusResponse,
    summary="查询异步入库任务状态",
)
async def get_ingest_job(job_id: str):
    data = await job_get(job_id)
    if data is None:
        raise NotFoundError(f"任务 '{job_id}' 不存在或已过期")
    return IngestJobStatusResponse(
        job_id=data.get("job_id", job_id),
        status=data.get("status", "unknown"),
        result=data.get("result"),
        error=data.get("error"),
    )


@router.get("", response_model=KnowledgeBaseListResponse, summary="列出所有知识库")
async def list_kbs(svc: KnowledgeService = Depends(_svc)):
    return await svc.list_kbs()


@router.post("", response_model=KnowledgeBaseResponse, summary="创建知识库")
async def create_kb(req: KnowledgeBaseCreateRequest, svc: KnowledgeService = Depends(_svc)):
    return await svc.create_kb(req)


@router.get("/{kb_id}", response_model=KnowledgeBaseResponse, summary="获取知识库详情")
async def get_kb(kb_id: str, svc: KnowledgeService = Depends(_svc)):
    return await svc.get_kb(kb_id)


@router.delete("/{kb_id}", status_code=204, summary="删除知识库")
async def remove_kb(kb_id: str, svc: KnowledgeService = Depends(_svc)):
    await svc.delete_kb(kb_id)


@router.post("/{kb_id}/ingest", response_model=IngestResponse, summary="上传文档入库（同步）")
async def ingest(
    kb_id: str,
    file: UploadFile,
    svc: KnowledgeService = Depends(_svc),
):
    content = await file.read()
    return await svc.ingest_file(kb_id, file.filename or "unknown", content)


@router.post(
    "/{kb_id}/ingest-async",
    response_model=IngestJobCreateResponse,
    summary="上传文档异步入库（大文件推荐，轮询 /api/knowledge/jobs/{job_id}）",
)
async def ingest_async(
    kb_id: str,
    file: UploadFile,
    background_tasks: BackgroundTasks,
    svc: KnowledgeService = Depends(_svc),
):
    # 先校验知识库存在（与同步入库一致）
    await svc.get_kb(kb_id)
    content = await file.read()
    job_id = await job_create()
    filename = file.filename or "unknown"
    settings = get_settings()
    if settings.celery_ingest_enabled:
        await stash_ingest_blob(job_id, content)
        from app.workers.tasks import ingest_document_task

        async_result = ingest_document_task.delay(job_id, kb_id, filename)
        await job_update(job_id, celery_task_id=async_result.id)
        return IngestJobCreateResponse(
            job_id=job_id, status="pending", celery_task_id=async_result.id
        )
    background_tasks.add_task(
        run_ingest_background,
        job_id,
        kb_id,
        filename,
        content,
    )
    return IngestJobCreateResponse(job_id=job_id, status="pending")


@router.post("/{kb_id}/search", response_model=SearchResponse, summary="知识库语义检索")
async def search(
    kb_id: str,
    req: SearchRequest,
    svc: KnowledgeService = Depends(_svc),
):
    return await svc.search(kb_id, req)

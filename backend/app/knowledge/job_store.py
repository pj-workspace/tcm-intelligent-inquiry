"""异步入库任务状态（Redis）与执行管线。"""

import base64
import json
import uuid

from app.core.logging import get_logger
from app.core.redis_client import get_redis

logger = get_logger(__name__)

_PREFIX = "tcm:ingest_job:"
_BLOB_PREFIX = "tcm:ingest_blob:"
_TTL_SEC = 60 * 60 * 24 * 7  # 7 天
_BLOB_TTL_SEC = 60 * 60  # 1 小时


def _key(job_id: str) -> str:
    return f"{_PREFIX}{job_id}"


def _blob_key(job_id: str) -> str:
    return f"{_BLOB_PREFIX}{job_id}"


async def job_create() -> str:
    jid = str(uuid.uuid4())
    r = get_redis()
    await r.set(_key(jid), json.dumps({"status": "pending", "job_id": jid}), ex=_TTL_SEC)
    return jid


async def job_update(job_id: str, **fields) -> None:
    r = get_redis()
    raw = await r.get(_key(job_id))
    base = json.loads(raw) if raw else {"job_id": job_id}
    base.update(fields)
    await r.set(_key(job_id), json.dumps(base), ex=_TTL_SEC)


async def job_get(job_id: str) -> dict | None:
    r = get_redis()
    raw = await r.get(_key(job_id))
    if not raw:
        return None
    return json.loads(raw)


async def stash_ingest_blob(job_id: str, content: bytes) -> None:
    """将上传内容暂存 Redis（base64 文本），供 Celery worker 拉取。"""
    r = get_redis()
    b64 = base64.b64encode(content).decode("ascii")
    await r.set(_blob_key(job_id), b64, ex=_BLOB_TTL_SEC)


async def pop_ingest_blob(job_id: str) -> bytes | None:
    """取出并删除暂存内容；若无则返回 None。"""
    r = get_redis()
    key = _blob_key(job_id)
    raw = await r.get(key)
    if raw is None:
        return None
    await r.delete(key)
    return base64.b64decode(raw)


async def run_ingest_pipeline(
    job_id: str,
    kb_id: str,
    filename: str,
    content: bytes,
) -> None:
    """执行入库：更新任务状态并写入数据库 / 向量库。"""
    from app.core.database import async_session_factory
    from app.knowledge.service import KnowledgeService

    try:
        await job_update(job_id, status="running")
        async with async_session_factory() as session:
            svc = KnowledgeService(session)
            result = await svc.ingest_file(kb_id, filename, content)
            await session.commit()
        await job_update(
            job_id,
            status="completed",
            result=result.model_dump(),
        )
    except Exception as exc:
        logger.exception("ingest job %s failed", job_id)
        await job_update(job_id, status="failed", error=str(exc))


async def run_ingest_background(
    job_id: str,
    kb_id: str,
    filename: str,
    content: bytes,
) -> None:
    """FastAPI BackgroundTasks 使用的进程内异步入库。"""
    await run_ingest_pipeline(job_id, kb_id, filename, content)


async def run_ingest_from_stash(job_id: str, kb_id: str, filename: str) -> None:
    """Celery worker：从 Redis 取出上传内容后执行入库。"""
    content = await pop_ingest_blob(job_id)
    if content is None:
        await job_update(
            job_id,
            status="failed",
            error="上传内容已过期或未找到（请重试上传）",
        )
        return
    await run_ingest_pipeline(job_id, kb_id, filename, content)

"""异步入库任务状态（Redis）与执行管线。"""

import asyncio
import base64
import json
import uuid
from pathlib import Path

from app.core.config import get_settings
from app.core.logging import get_logger
from app.core.redis_client import get_redis

logger = get_logger(__name__)

_PREFIX = "tcm:ingest_job:"
_BLOB_PREFIX = "tcm:ingest_blob:"
_TTL_SEC = 60 * 60 * 24 * 7  # 7 天
_BLOB_TTL_SEC = 60 * 60  # 1 小时

_BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent


def _ingest_temp_root() -> Path:
    s = get_settings()
    if s.ingest_temp_dir.strip():
        return Path(s.ingest_temp_dir).expanduser().resolve()
    return _BACKEND_ROOT / "data" / "ingest_tmp"


def _key(job_id: str) -> str:
    return f"{_PREFIX}{job_id}"


def _blob_key(job_id: str) -> str:
    return f"{_BLOB_PREFIX}{job_id}"


async def job_create(owner_id: str | None = None) -> str:
    jid = str(uuid.uuid4())
    r = get_redis()
    payload: dict = {"status": "pending", "job_id": jid}
    if owner_id:
        payload["owner_id"] = owner_id
    await r.set(_key(jid), json.dumps(payload), ex=_TTL_SEC)
    return jid


async def job_update(job_id: str, **fields) -> None:
    r = get_redis()
    raw = await r.get(_key(job_id))
    base = json.loads(raw) if raw else {"job_id": job_id}
    base.update(fields)
    await r.set(_key(job_id), json.dumps(base), ex=_TTL_SEC)


async def job_get(job_id: str, owner_id: str | None = None) -> dict | None:
    r = get_redis()
    raw = await r.get(_key(job_id))
    if not raw:
        return None
    data = json.loads(raw)
    if owner_id is not None:
        job_owner = data.get("owner_id")
        if job_owner is not None and job_owner != owner_id:
            return None
    return data


async def stash_ingest_blob(job_id: str, content: bytes) -> None:
    """将上传内容暂存 Redis（base64 文本），供 Celery worker 拉取。"""
    r = get_redis()
    b64 = base64.b64encode(content).decode("ascii")
    await r.set(_blob_key(job_id), b64, ex=_BLOB_TTL_SEC)


async def stash_ingest_to_disk(job_id: str, content: bytes, filename: str) -> None:
    """Celery 路径：写入本地临时文件，避免大文件占用 Redis 内存。"""
    root = _ingest_temp_root()
    root.mkdir(parents=True, exist_ok=True)
    safe = "".join(c for c in (filename or "upload.bin") if c.isalnum() or c in "._-")[:180] or "upload.bin"
    path = root / f"{job_id}_{safe}"
    path.write_bytes(content)
    await job_update(job_id, stash_kind="disk", stash_path=str(path))


async def pop_ingest_blob(job_id: str) -> bytes | None:
    """取出并删除暂存内容；若无则返回 None。"""
    r = get_redis()
    key = _blob_key(job_id)
    raw = await r.get(key)
    if raw is None:
        return None
    await r.delete(key)
    return base64.b64decode(raw)


async def _load_ingest_bytes(job_id: str) -> bytes | None:
    """优先从磁盘 stash 读取并删除；否则从 Redis blob。"""
    meta = await job_get(job_id)
    if meta and meta.get("stash_kind") == "disk" and meta.get("stash_path"):
        path = Path(meta["stash_path"])
        try:
            data = path.read_bytes()
        except OSError as exc:
            logger.warning("读取异步入库临时文件失败 job=%s path=%s: %s", job_id, path, exc)
            return None
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass
        return data
    return await pop_ingest_blob(job_id)


async def _assert_kb_matches_job_owner(
    kb_id: str,
    owner_id: str | None,
) -> bool:
    """Celery 侧校验任务归属与知识库一致；owner 缺失的旧任务仅校验 kb 存在。"""
    from app.core.database import async_session_factory
    from app.knowledge.models import KnowledgeBaseRecord

    async with async_session_factory() as session:
        row = await session.get(KnowledgeBaseRecord, kb_id)
        if row is None:
            return False
        if owner_id is None:
            return True
        return row.owner_id == owner_id


async def _execute_ingest_core(
    job_id: str,
    kb_id: str,
    filename: str,
    content: bytes,
    owner_id: str | None,
) -> None:
    """执行入库（失败时抛异常，由调用方决定是否重试）。"""
    from app.core.database import async_session_factory
    from app.knowledge.service import KnowledgeService

    await job_update(job_id, status="running")
    async with async_session_factory() as session:
        svc = KnowledgeService(session)
        if owner_id is None:
            raise ValueError("异步入库任务缺少 owner_id，请重新上传")
        result = await svc.ingest_file(kb_id, filename, content, owner_id)
        await session.commit()
    await job_update(
        job_id,
        status="completed",
        result=result.model_dump(),
    )


async def run_ingest_pipeline(
    job_id: str,
    kb_id: str,
    filename: str,
    content: bytes,
    owner_id: str | None,
) -> None:
    """执行入库：更新任务状态并写入数据库 / 向量库（失败时写入 Redis 任务状态）。"""
    try:
        await _execute_ingest_core(job_id, kb_id, filename, content, owner_id)
    except Exception as exc:
        logger.exception("ingest job %s failed", job_id)
        await job_update(job_id, status="failed", error=str(exc))


async def run_ingest_background(
    job_id: str,
    kb_id: str,
    filename: str,
    content: bytes,
    owner_id: str,
) -> None:
    """FastAPI BackgroundTasks 使用的进程内异步入库。"""
    await run_ingest_pipeline(job_id, kb_id, filename, content, owner_id)


async def run_ingest_from_stash(job_id: str, kb_id: str, filename: str) -> None:
    """Celery worker：从磁盘临时文件或 Redis 取出上传内容后执行入库。"""
    meta = await job_get(job_id)
    owner_id = meta.get("owner_id") if meta else None

    content = await _load_ingest_bytes(job_id)
    if content is None:
        await job_update(
            job_id,
            status="failed",
            error="上传内容已过期或未找到（请重试上传）",
        )
        return

    if not await _assert_kb_matches_job_owner(kb_id, owner_id):
        await job_update(
            job_id,
            status="failed",
            error="知识库不存在或无权访问该入库任务",
        )
        return

    await _execute_ingest_core(job_id, kb_id, filename, content, owner_id)


def run_ingest_from_stash_with_retries(job_id: str, kb_id: str, filename: str) -> None:
    """Celery 同步入口：带有限次重试（指数退避），最后一次失败写入任务状态。"""
    delays_sec = (15, 45, 90)
    last_exc: Exception | None = None
    for attempt in range(4):
        try:
            asyncio.run(run_ingest_from_stash(job_id, kb_id, filename))
            return
        except Exception as exc:
            last_exc = exc
            logger.warning(
                "ingest Celery 尝试 %s/4 失败 job=%s: %s",
                attempt + 1,
                job_id,
                exc,
            )
            if attempt < 3:
                import time

                time.sleep(delays_sec[attempt])
            else:
                asyncio.run(
                    job_update(job_id, status="failed", error=str(last_exc))
                )
                raise

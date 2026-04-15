"""Celery 任务定义。"""

import asyncio

from celery_app import celery_app


@celery_app.task(name="knowledge.ingest_document", bind=True)
def ingest_document_task(
    self,
    job_id: str,
    kb_id: str,
    filename: str,
) -> None:
    """从 Redis 读取暂存文件并执行知识库入库。"""
    from app.knowledge.job_store import run_ingest_from_stash

    asyncio.run(run_ingest_from_stash(job_id, kb_id, filename))

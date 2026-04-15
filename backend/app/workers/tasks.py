"""Celery 任务定义。"""

from celery_app import celery_app


@celery_app.task(name="knowledge.ingest_document", bind=True)
def ingest_document_task(
    self,
    job_id: str,
    kb_id: str,
    filename: str,
) -> None:
    """从 Redis/磁盘暂存读取文件并执行知识库入库；内置有限次重试与超时（见 celery_app 配置）。"""
    from app.knowledge.job_store import run_ingest_from_stash_with_retries

    run_ingest_from_stash_with_retries(job_id, kb_id, filename)

"""Celery 应用实例（在 backend 目录执行：celery -A celery_app worker -l info）。"""

from celery import Celery

from app.core.config import get_settings


def make_celery() -> Celery:
    s = get_settings()
    app = Celery(
        "tcm",
        broker=s.redis_url,
        backend=s.redis_url,
    )
    app.conf.update(
        task_serializer="json",
        result_serializer="json",
        accept_content=["json"],
        timezone="UTC",
        enable_utc=True,
        task_track_started=True,
        task_time_limit=60 * 60,
        task_soft_time_limit=55 * 60,
        task_default_queue="tcm",
        task_annotations={
            "knowledge.ingest_document": {
                "time_limit": 60 * 60,
                "soft_time_limit": 55 * 60,
            },
        },
    )
    return app


celery_app = make_celery()

# 注册任务（避免 Celery include 与 tasks 内 import 形成循环依赖）
from app.workers import tasks as _ingest_tasks  # noqa: F401

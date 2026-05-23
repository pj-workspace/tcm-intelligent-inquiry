"""`knowledge` 子包导出与命名空间。"""
# knowledge: 知识库管理域
#
# 子包职责：
#   api/           FastAPI 路由与路由级依赖
#   services/      KnowledgeService（元数据 CRUD、同步入库与检索编排）
#   ingest/        入库前正文提取与分块
#   search/        Qdrant 向量库、语义召回与重排序
#   jobs/          异步入库任务（Redis/Celery/BackgroundTasks）
#   models.py      ORM
#   schemas.py     API 契约

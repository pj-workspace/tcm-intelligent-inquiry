"""`chat` 子包导出与命名空间。"""
# chat: 对话域
#
# 子包职责：
#   api/          FastAPI 路由
#   services/     流式对话、历史、分组等业务服务
#   suggestions/  追问与附图话术等旁路生成
#   images/       VL 前图片探测与清洗
#   policy/       会话访问、模型/能力解析
#   models.py     ORM（供 Alembic / init_db 注册 metadata）
#   schemas.py    请求响应模型

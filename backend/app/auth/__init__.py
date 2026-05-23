"""`auth` 子包导出与命名空间。"""
# auth: 账号与 OAuth 认证域
#
# 子包职责：
#   api/           账号密码相关 FastAPI 路由与安全依赖（Bearer、API Key）
#   services/      AuthService、SMTP/Redis 验证码管线
#   security/      JWT、密码哈希
#   oauth/         第三方 OAuth 路由与绑定逻辑
#   models.py      ORM（含 OAuth 绑定表）
#   schemas.py     REST 契约

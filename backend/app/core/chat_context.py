"""对话请求上下文：供 Agent 工具读取当前用户（如知识库多租户）。"""

from contextvars import ContextVar

# 当前对话关联的用户 ID（未登录为 None）
chat_user_id: ContextVar[str | None] = ContextVar("chat_user_id", default=None)

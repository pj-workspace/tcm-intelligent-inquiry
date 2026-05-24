"""对话请求上下文：供 Agent 工具读取当前用户（如知识库多租户）。"""

from contextvars import ContextVar

# 当前对话关联的用户 ID（未登录为 None）
chat_user_id: ContextVar[str | None] = ContextVar("chat_user_id", default=None)

# 当前 SSE 轮次关联的会话 ID（供 secret:// 引用解析）
chat_conversation_id: ContextVar[str | None] = ContextVar("chat_conversation_id", default=None)

# 当前对话所用 Agent 绑定的默认知识库 ID（未设置或未用 Agent 时为 None）
chat_agent_kb_id: ContextVar[str | None] = ContextVar("chat_agent_kb_id", default=None)

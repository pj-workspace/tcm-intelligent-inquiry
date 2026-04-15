from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1)


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, description="本轮用户输入")
    history: list[ChatMessage] = Field(
        default_factory=list,
        description="仅在新会话首轮有效：客户端维护的历史；传入 conversation_id 后服务端以数据库为准",
    )
    conversation_id: str | None = Field(
        default=None, description="已有会话 ID；不传则创建新会话并在首包 meta 中返回",
    )
    agent_id: str | None = Field(
        default=None, description="指定使用的 Agent ID（None 时用默认 Agent）"
    )


class ConversationItem(BaseModel):
    id: str
    title: str
    agent_id: str | None = None
    created_at: datetime


class MessageItem(BaseModel):
    id: str
    role: str
    content: str
    created_at: datetime

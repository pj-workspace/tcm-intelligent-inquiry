"""会话与消息 ORM。"""

from datetime import datetime

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ConversationGroupRecord(Base):
    """用户对会话的手工分组（侧栏文件夹）。"""

    __tablename__ = "conversation_groups"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer(), nullable=False, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )


class ConversationRecord(Base):
    """Conversation Record."""
    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(512), default="")
    agent_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    #: 所属分组；None 表示侧栏「未分组 / 聊天」列表
    group_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("conversation_groups.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    #: 未登录用户会话的持有凭证；仅当 user_id 为空时使用
    anon_session_secret: Mapped[str | None] = mapped_column(String(64), nullable=True)


class MessageRecord(Base):
    """单条会话消息行。

    ``citations`` 仅存于 ``role=assistant``：与请求内 ``CitationSource`` 列表同构，
    供历史 API 与前端角标/来源面板回放；thinking/tool 等角色不使用该列。
    """

    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    conversation_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role: Mapped[str] = mapped_column(String(16))  # user | assistant | thinking | tool
    content: Mapped[str] = mapped_column(Text)
    #: 仅 role=thinking 时使用：该段思考耗时（秒）
    duration_sec: Mapped[float | None] = mapped_column(Float, nullable=True)
    #: 仅 role=assistant 时使用：生成该条回复时使用的对话模型名
    model_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    #: 仅 role=assistant：模型生成的追问建议（持久化便于刷新后继续展示）
    follow_up_suggestions: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    #: 仅 role=assistant：本轮最终答案可引用的结构化来源（知识库/网页/方剂等）
    citations: Mapped[list[dict] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

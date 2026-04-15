"""Agent ORM 模型（PostgreSQL）。"""

from sqlalchemy import JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AgentRecord(Base):
    """Agent 配置：工具列表与系统提示持久化。"""

    __tablename__ = "agents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text, default="")
    # 启用的工具名列表；空列表表示使用注册表中的全部工具
    tool_names: Mapped[list[str]] = mapped_column(JSON, default=list)
    system_prompt: Mapped[str] = mapped_column(Text, default="")

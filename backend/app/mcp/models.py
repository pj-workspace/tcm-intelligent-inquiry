"""MCP 服务注册 ORM（PostgreSQL）。"""

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class McpServerRecord(Base):
    """已注册的 MCP 服务端点；进程重启后从本表恢复并重新挂载 LangChain 工具。"""

    __tablename__ = "mcp_servers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    transport: Mapped[str] = mapped_column(String(16), default="http", nullable=False)
    url: Mapped[str | None] = mapped_column(Text, nullable=True)
    stdio_config: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    description: Mapped[str] = mapped_column(Text, default="")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    headers: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    tool_names: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    last_probe_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_probe_error: Mapped[str | None] = mapped_column(Text, nullable=True)

"""用户与 OAuth 绑定 ORM。"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def utc_naive_now() -> datetime:
    """用于 TIMESTAMP WITHOUT TIME ZONE 列；asyncpg 对 aware naive 混用会报错。"""
    return datetime.now(UTC).replace(tzinfo=None)


class UserRecord(Base):
    """User Record."""
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    email: Mapped[str | None] = mapped_column(String(255), unique=True, index=True, nullable=True)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)

    oauth_accounts: Mapped[list["UserOauthAccount"]] = relationship(
        "UserOauthAccount",
        back_populates="user",
        cascade="all, delete-orphan",
    )


class UserOauthAccount(Base):
    """User Oauth Account."""
    __tablename__ = "user_oauth_accounts"
    __table_args__ = (
        UniqueConstraint("provider", "external_id", name="uq_oauth_provider_ext"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    provider: Mapped[str] = mapped_column(String(32), index=True)
    external_id: Mapped[str] = mapped_column(String(64), index=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    external_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    external_nickname: Mapped[str | None] = mapped_column(String(128), nullable=True)
    external_avatar: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=lambda: utc_naive_now())
    last_login_at: Mapped[datetime | None] = mapped_column(nullable=True)

    user: Mapped[UserRecord] = relationship("UserRecord", back_populates="oauth_accounts")

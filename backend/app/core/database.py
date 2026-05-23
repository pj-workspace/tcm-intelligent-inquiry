"""异步 SQLAlchemy 引擎与会话工厂。

表结构在首次启动时通过 metadata.create_all 创建；生产环境建议改用 Alembic 迁移。
对已存在的旧表，`metadata.create_all` 不会自动 ALTER 加列，因此 `init_db` 在创建
之后会执行少量 PostgreSQL 专用的 `ADD COLUMN IF NOT EXISTS` 兜底。
"""

from collections.abc import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class Base(DeclarativeBase):
    pass


def _engine():
    s = get_settings()
    return create_async_engine(
        s.database_url,
        echo=False,
        pool_pre_ping=True,
    )


engine = _engine()
async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# 轻量补列 DDL（PostgreSQL ADD COLUMN IF NOT EXISTS，对老库安全幂等）
_AUTO_MIGRATE_DDL: tuple[str, ...] = (
    # knowledge_bases：嵌入指纹列
    "ALTER TABLE knowledge_bases ADD COLUMN IF NOT EXISTS embedding_provider VARCHAR(50)",
    "ALTER TABLE knowledge_bases ADD COLUMN IF NOT EXISTS embedding_model VARCHAR(120)",
    "ALTER TABLE knowledge_bases ADD COLUMN IF NOT EXISTS embedding_dim INTEGER",
    # mcp_servers：请求头列
    "ALTER TABLE mcp_servers ADD COLUMN IF NOT EXISTS headers JSONB NOT NULL DEFAULT '{}'",
    "ALTER TABLE messages ADD COLUMN IF NOT EXISTS citations JSONB",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false",
    "CREATE UNIQUE INDEX IF NOT EXISTS ux_users_email_notnull ON users (email) WHERE email IS NOT NULL",
)


async def _auto_migrate_columns() -> None:
    """对已有表补齐新增列；仅 PostgreSQL 生效（IF NOT EXISTS 语法依赖 PG）。"""
    s = get_settings()
    if "postgres" not in (s.database_url or "").lower():
        return
    async with engine.begin() as conn:
        for stmt in _AUTO_MIGRATE_DDL:
            try:
                await conn.execute(text(stmt))
            except Exception as exc:
                logger.warning("auto-migrate skipped: %s — %s", stmt, exc)


async def init_db() -> None:
    """创建缺失的表（仅当配置 database_auto_create_tables 为 True）。"""
    if not get_settings().database_auto_create_tables:
        return
    # 确保模型已注册到 metadata
    from app.agent import models as _agent_models  # noqa: F401
    from app.auth import models as _auth_models  # noqa: F401
    from app.chat import models as _chat_models  # noqa: F401
    from app.knowledge import models as _knowledge_models  # noqa: F401
    from app.mcp import models as _mcp_models  # noqa: F401
    from app.agent.tools.formula import models as _formula_models  # noqa: F401
    from app.llm.billing import models as _billing_models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    await _auto_migrate_columns()

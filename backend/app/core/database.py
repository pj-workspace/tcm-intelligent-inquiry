"""异步 SQLAlchemy 引擎与会话工厂。

表结构在首次启动时通过 metadata.create_all 创建；生产环境建议改用 Alembic 迁移。
"""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings


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


async def init_db() -> None:
    """创建缺失的表。"""
    # 确保模型已注册到 metadata
    from app.agent import models as _agent_models  # noqa: F401
    from app.auth import models as _auth_models  # noqa: F401
    from app.chat import models as _chat_models  # noqa: F401
    from app.knowledge import models as _knowledge_models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

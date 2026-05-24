"""Agent 删除时同步会话绑定。"""

from __future__ import annotations

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.chat.models import ConversationRecord
from app.core.logging import get_logger

logger = get_logger(__name__)


async def reset_conversations_agent_to_default(
    session: AsyncSession,
    agent_id: str,
) -> int:
    """将引用已删除 Agent 的会话 agent_id 置空（系统默认）。"""
    aid = (agent_id or "").strip()
    if not aid:
        return 0

    r = await session.execute(
        select(ConversationRecord.id).where(ConversationRecord.agent_id == aid)
    )
    conv_ids = [row[0] for row in r.all()]
    if not conv_ids:
        return 0

    await session.execute(
        update(ConversationRecord)
        .where(ConversationRecord.agent_id == aid)
        .values(agent_id=None)
    )
    logger.info(
        "已将会话 Agent 绑定重置为系统默认 agent_id=%s conversations=%s",
        aid,
        conv_ids,
    )
    return len(conv_ids)

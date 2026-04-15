"""会话列表与消息查询。"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import UserRecord
from app.chat.access import assert_can_use_conversation
from app.chat.models import ConversationRecord, MessageRecord
from app.chat.schemas import ConversationItem, MessageItem
async def list_my_conversations(
    session: AsyncSession,
    user: UserRecord,
) -> list[ConversationItem]:
    r = await session.execute(
        select(ConversationRecord)
        .where(ConversationRecord.user_id == user.id)
        .order_by(ConversationRecord.created_at.desc())
    )
    rows = r.scalars().all()
    return [
        ConversationItem(
            id=x.id,
            title=x.title or "",
            agent_id=x.agent_id,
            created_at=x.created_at,
        )
        for x in rows
    ]


async def list_messages_for_conversation(
    session: AsyncSession,
    conversation_id: str,
    user: UserRecord | None,
) -> list[MessageItem]:
    await assert_can_use_conversation(session, conversation_id, user)
    r = await session.execute(
        select(MessageRecord)
        .where(MessageRecord.conversation_id == conversation_id)
        .order_by(MessageRecord.created_at)
    )
    rows = r.scalars().all()
    return [
        MessageItem(
            id=m.id,
            role=m.role,
            content=m.content,
            created_at=m.created_at,
        )
        for m in rows
    ]

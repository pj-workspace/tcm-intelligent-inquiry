"""会话访问校验。"""

from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import UserRecord
from app.chat.models import ConversationRecord
from app.core.exceptions import ForbiddenError, NotFoundError


async def assert_can_use_conversation(
    session: AsyncSession,
    conversation_id: str,
    user: UserRecord | None,
) -> ConversationRecord:
    """已登录用户仅能访问本人会话；匿名可继续 user_id 为空的会话。"""
    row = await session.get(ConversationRecord, conversation_id)
    if row is None:
        raise NotFoundError(f"会话 '{conversation_id}' 不存在")
    if row.user_id:
        if user is None or user.id != row.user_id:
            raise ForbiddenError("无权访问该会话")
    return row

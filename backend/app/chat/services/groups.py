"""会话分组 CRUD 与会话归属。"""

import uuid

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import UserRecord
from app.chat.models import ConversationGroupRecord, ConversationRecord
from app.chat.policy.access import assert_can_use_conversation
from app.chat.schemas import ConversationGroupItem
from app.core.exceptions import ForbiddenError, NotFoundError


async def assert_own_group(
    session: AsyncSession,
    group_id: str,
    user: UserRecord,
) -> ConversationGroupRecord:
    """Assert own group。"""
    row = await session.get(ConversationGroupRecord, group_id)
    if row is None:
        raise NotFoundError(f"分组 '{group_id}' 不存在")
    if row.user_id != user.id:
        raise ForbiddenError("无权访问该分组")
    return row


async def list_groups(
    session: AsyncSession,
    user: UserRecord,
) -> list[ConversationGroupItem]:
    """List groups。"""
    r = await session.execute(
        select(ConversationGroupRecord)
        .where(ConversationGroupRecord.user_id == user.id)
        .order_by(
            ConversationGroupRecord.sort_order.asc(),
            ConversationGroupRecord.created_at.desc(),
        )
    )
    rows = r.scalars().all()
    return [
        ConversationGroupItem(
            id=x.id,
            name=x.name,
            sort_order=x.sort_order,
            created_at=x.created_at,
        )
        for x in rows
    ]


async def create_group(session: AsyncSession, user: UserRecord, name: str) -> ConversationGroupItem:
    """Create group (``session``, ``user``, ``name``)."""
    nid = str(uuid.uuid4())
    r = await session.execute(
        select(func.coalesce(func.max(ConversationGroupRecord.sort_order), -1)).where(
            ConversationGroupRecord.user_id == user.id
        )
    )
    max_so = r.scalar_one()
    sort_order = (max_so + 1) if max_so is not None else 0
    row = ConversationGroupRecord(
        id=nid,
        user_id=user.id,
        name=name.strip()[:128],
        sort_order=sort_order,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return ConversationGroupItem(
        id=row.id,
        name=row.name,
        sort_order=row.sort_order,
        created_at=row.created_at,
    )


async def rename_group(
    session: AsyncSession,
    user: UserRecord,
    group_id: str,
    name: str,
) -> None:
    """Rename group。"""
    g = await assert_own_group(session, group_id, user)
    g.name = name.strip()[:128]
    await session.commit()


async def delete_group(session: AsyncSession, user: UserRecord, group_id: str) -> None:
    """Delete group (``session``, ``user``, ``group_id``)."""
    g = await assert_own_group(session, group_id, user)
    # FK ON DELETE SET NULL 会清空 conversations.group_id；显式做一次也无妨（兼容 SQLite 外键关闭时）
    await session.execute(
        update(ConversationRecord)
        .where(ConversationRecord.group_id == group_id)
        .values(group_id=None)
    )
    await session.delete(g)
    await session.commit()


async def update_conversation_group(
    session: AsyncSession,
    user: UserRecord,
    conversation_id: str,
    group_id: str | None,
) -> None:
    """Update conversation group。"""
    conv = await assert_can_use_conversation(session, conversation_id, user, None)
    if conv.user_id is None or conv.user_id != user.id:
        raise ForbiddenError("仅能为自己已登录创建的会话设置分组")

    if group_id is None:
        conv.group_id = None
        await session.commit()
        return

    await assert_own_group(session, group_id, user)
    conv.group_id = group_id
    await session.commit()

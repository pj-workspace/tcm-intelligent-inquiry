"""会话列表与消息查询。"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.models import AgentRecord
from app.auth.models import UserRecord
from app.chat.models import ConversationRecord, MessageRecord
from app.chat.policy.access import assert_can_use_conversation
from app.chat.schemas import ConversationItem, MessageItem, MessageListResponse


def _normalized_follow_up_suggestions(v: object | None) -> list[str] | None:
    """Internal helper: normalized follow up suggestions."""
    if not isinstance(v, list):
        return None
    out = [str(x).strip() for x in v if isinstance(x, str) and x.strip()]
    return out if out else None


def _normalized_citations(v: object | None) -> list[dict] | None:
    """从 ORM JSON 列读出 citations；丢弃非 dict 元素，空列表视为 None。"""
    if not isinstance(v, list):
        return None
    out = [x for x in v if isinstance(x, dict)]
    return out if out else None


def _last_assistant_model_subquery():
    """每个 conversation_id 对应最新一条 assistant 的 model_name。"""
    return (
        select(MessageRecord.model_name)
        .where(
            MessageRecord.conversation_id == ConversationRecord.id,
            MessageRecord.role == "assistant",
        )
        .order_by(MessageRecord.created_at.desc())
        .limit(1)
        .correlate(ConversationRecord)
        .scalar_subquery()
    )


async def list_my_conversations(
    session: AsyncSession,
    user: UserRecord,
) -> list[ConversationItem]:
    """List my conversations。"""
    last_model = _last_assistant_model_subquery()
    r = await session.execute(
        select(
            ConversationRecord,
            AgentRecord.name.label("agent_name"),
            last_model.label("last_model_name"),
        )
        .outerjoin(AgentRecord, AgentRecord.id == ConversationRecord.agent_id)
        .where(ConversationRecord.user_id == user.id)
        .order_by(ConversationRecord.created_at.desc())
    )
    rows = r.all()
    out: list[ConversationItem] = []
    for conv, agent_name, last_model_name in rows:
        an = (agent_name or "").strip() or None
        if conv.agent_id and not an:
            conv.agent_id = None
        lmn = (last_model_name or "").strip() or None
        out.append(
            ConversationItem(
                id=conv.id,
                title=conv.title or "",
                agent_id=conv.agent_id,
                agent_name=an,
                last_model_name=lmn,
                created_at=conv.created_at,
                group_id=conv.group_id,
            )
        )
    return out


def _row_to_message_item(m: MessageRecord) -> MessageItem:
    return MessageItem(
        id=m.id,
        role=m.role,
        content=m.content,
        created_at=m.created_at,
        duration_sec=m.duration_sec,
        model_name=m.model_name,
        citations=_normalized_citations(m.citations),
        follow_up_suggestions=_normalized_follow_up_suggestions(m.follow_up_suggestions),
    )


async def list_messages_for_conversation(
    session: AsyncSession,
    conversation_id: str,
    user: UserRecord | None,
    anon_session_secret: str | None = None,
    *,
    limit: int | None = None,
    before: str | None = None,
    load_all: bool = False,
) -> MessageListResponse:
    """List messages for conversation（支持向上分页）。"""
    await assert_can_use_conversation(
        session, conversation_id, user, anon_session_secret
    )

    if load_all or limit is None:
        r = await session.execute(
            select(MessageRecord)
            .where(MessageRecord.conversation_id == conversation_id)
            .order_by(MessageRecord.created_at)
        )
        rows = r.scalars().all()
        return MessageListResponse(
            messages=[_row_to_message_item(m) for m in rows],
            has_more=False,
        )

    before_id = (before or "").strip()
    before_created_at = None
    if before_id:
        r_before = await session.execute(
            select(MessageRecord).where(
                MessageRecord.id == before_id,
                MessageRecord.conversation_id == conversation_id,
            )
        )
        before_row = r_before.scalar_one_or_none()
        if before_row is not None:
            before_created_at = before_row.created_at

    q = select(MessageRecord).where(MessageRecord.conversation_id == conversation_id)
    if before_created_at is not None:
        q = q.where(MessageRecord.created_at < before_created_at)

    r = await session.execute(
        q.order_by(MessageRecord.created_at.desc()).limit(max(1, limit) + 1)
    )
    rows = list(r.scalars().all())
    has_more = len(rows) > limit
    page = rows[:limit]
    page.reverse()
    return MessageListResponse(
        messages=[_row_to_message_item(m) for m in page],
        has_more=has_more,
    )


async def delete_conversation(
    session: AsyncSession,
    conversation_id: str,
    user: UserRecord | None,
    anon_session_secret: str | None = None,
) -> None:
    """Delete conversation。"""
    conv = await assert_can_use_conversation(
        session, conversation_id, user, anon_session_secret
    )
    await session.delete(conv)
    await session.commit()


async def update_conversation_title(
    session: AsyncSession,
    conversation_id: str,
    title: str,
    user: UserRecord | None,
    anon_session_secret: str | None = None,
) -> None:
    """Update conversation title。"""
    conv = await assert_can_use_conversation(
        session, conversation_id, user, anon_session_secret
    )
    conv.title = title[:512]
    await session.commit()


async def persist_follow_up_suggestions_for_assistant_message(
    session: AsyncSession,
    *,
    conversation_id: str,
    assistant_message_id: str | None,
    suggestions: list[str],
    user: UserRecord | None,
    anon_session_secret: str | None,
) -> None:
    """将追问建议写入助手消息。

    前端当前用的气泡 id（时间戳拼接）与落库 UUID 常不一致：先按 id 精确匹配，
    失败则退回「该会话 created_at 最新的一条 assistant」，与流结束后立即请求追问的时序对齐。
    """
    await assert_can_use_conversation(
        session, conversation_id, user, anon_session_secret
    )
    normalized = _normalized_follow_up_suggestions(suggestions)

    row: MessageRecord | None = None
    mid = (assistant_message_id or "").strip()
    if len(mid) >= 8:
        r = await session.execute(
            select(MessageRecord).where(
                MessageRecord.id == mid,
                MessageRecord.conversation_id == conversation_id,
                MessageRecord.role == "assistant",
            )
        )
        row = r.scalar_one_or_none()

    if row is None:
        r = await session.execute(
            select(MessageRecord)
            .where(
                MessageRecord.conversation_id == conversation_id,
                MessageRecord.role == "assistant",
            )
            .order_by(MessageRecord.created_at.desc())
            .limit(1)
        )
        row = r.scalar_one_or_none()

    if row is None:
        return
    row.follow_up_suggestions = normalized
    await session.flush()

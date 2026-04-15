"""对话与会话路由。"""

from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user, get_current_user_optional
from app.auth.models import UserRecord
from app.chat.access import assert_can_use_conversation
from app.chat.history_service import list_messages_for_conversation, list_my_conversations
from app.chat.schemas import ChatRequest, ConversationItem, MessageItem
from app.chat.service import stream_chat
from app.core.database import async_session_factory, get_session

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("", summary="流式对话（SSE），支持会话持久化")
async def chat(
    req: ChatRequest,
    user: Annotated[UserRecord | None, Depends(get_current_user_optional)],
):
    if req.conversation_id:
        async with async_session_factory() as session:
            await assert_can_use_conversation(session, req.conversation_id, user)
            await session.commit()

    return StreamingResponse(
        stream_chat(
            req.message,
            list(req.history),
            req.agent_id,
            req.conversation_id,
            user,
        ),
        media_type="text/event-stream",
    )


@router.get(
    "/conversations",
    response_model=list[ConversationItem],
    summary="当前用户的会话列表（需登录）",
)
async def conversations(
    session: Annotated[AsyncSession, Depends(get_session)],
    user: Annotated[UserRecord, Depends(get_current_user)],
):
    return await list_my_conversations(session, user)


@router.get(
    "/conversations/{conversation_id}/messages",
    response_model=list[MessageItem],
    summary="某会话下的消息列表",
)
async def conversation_messages(
    conversation_id: str,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: Annotated[UserRecord | None, Depends(get_current_user_optional)],
):
    return await list_messages_for_conversation(session, conversation_id, user)

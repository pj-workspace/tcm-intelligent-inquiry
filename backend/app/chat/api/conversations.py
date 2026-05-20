"""流式对话与会话 CRUD 路由。"""

from typing import Annotated

from fastapi import APIRouter, Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.api.deps import get_current_user, get_current_user_optional
from app.auth.models import UserRecord
from app.chat.schemas import (
    ConversationGroupAssign,
    ConversationItem,
    ConversationTitleUpdate,
    MessageItem,
)
from app.chat.services.groups import update_conversation_group
from app.chat.services.history import (
    delete_conversation,
    list_messages_for_conversation,
    list_my_conversations,
    update_conversation_title,
)
from app.core.database import get_session

router = APIRouter()


@router.get(
    "/model-options",
    summary="可选对话模型目录（全厂商分组；未配置 Key 的厂商 configured=false）",
)
async def chat_model_options():
    from app.chat.catalog import build_chat_model_catalog

    return build_chat_model_catalog()


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
    x_anon_session: Annotated[str | None, Header(alias="X-Anonymous-Session")] = None,
):
    return await list_messages_for_conversation(
        session, conversation_id, user, x_anon_session
    )


@router.put(
    "/conversations/{conversation_id}/group",
    summary="将会话移动到某分组（或移出分组）",
)
async def update_conversation_group_route(
    conversation_id: str,
    req: ConversationGroupAssign,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: Annotated[UserRecord, Depends(get_current_user)],
):
    await update_conversation_group(session, user, conversation_id, req.group_id)
    return {"success": True}


@router.delete(
    "/conversations/{conversation_id}",
    summary="删除会话",
)
async def delete_conversation_route(
    conversation_id: str,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: Annotated[UserRecord | None, Depends(get_current_user_optional)],
    x_anon_session: Annotated[str | None, Header(alias="X-Anonymous-Session")] = None,
):
    await delete_conversation(session, conversation_id, user, x_anon_session)
    return {"success": True}


@router.put(
    "/conversations/{conversation_id}/title",
    summary="修改会话标题",
)
async def update_conversation_title_route(
    conversation_id: str,
    req: ConversationTitleUpdate,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: Annotated[UserRecord | None, Depends(get_current_user_optional)],
    x_anon_session: Annotated[str | None, Header(alias="X-Anonymous-Session")] = None,
):
    await update_conversation_title(session, conversation_id, req.title, user, x_anon_session)
    return {"success": True}

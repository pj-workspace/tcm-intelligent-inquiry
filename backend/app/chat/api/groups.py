"""会话分组路由。"""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.api.deps import get_current_user
from app.auth.models import UserRecord
from app.chat.schemas import (
    ConversationGroupCreate,
    ConversationGroupItem,
    ConversationGroupRename,
)
from app.chat.services.groups import create_group, delete_group, list_groups, rename_group
from app.core.database import get_session

router = APIRouter()


@router.get(
    "/groups",
    response_model=list[ConversationGroupItem],
    summary="当前用户的会话分组列表",
)
async def chat_groups_list(
    session: Annotated[AsyncSession, Depends(get_session)],
    user: Annotated[UserRecord, Depends(get_current_user)],
):
    """Chat groups list。"""
    return await list_groups(session, user)


@router.post(
    "/groups",
    response_model=ConversationGroupItem,
    summary="新建分组",
)
async def chat_groups_create(
    req: ConversationGroupCreate,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: Annotated[UserRecord, Depends(get_current_user)],
):
    """Chat groups create。"""
    return await create_group(session, user, req.name)


@router.patch(
    "/groups/{group_id}",
    summary="重命名分组",
)
async def chat_groups_rename(
    group_id: str,
    req: ConversationGroupRename,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: Annotated[UserRecord, Depends(get_current_user)],
):
    """Chat groups rename。"""
    await rename_group(session, user, group_id, req.name)
    return {"success": True}


@router.delete(
    "/groups/{group_id}",
    summary="删除分组（会话移回未分组）",
)
async def chat_groups_delete(
    group_id: str,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: Annotated[UserRecord, Depends(get_current_user)],
):
    """Chat groups delete。"""
    await delete_group(session, user, group_id)
    return {"success": True}

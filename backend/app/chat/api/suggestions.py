"""追问与附图快捷话术路由。"""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.api.deps import get_current_user_optional
from app.auth.models import UserRecord
from app.chat.policy.access import assert_can_use_conversation
from app.chat.schemas import (
    AttachmentSuggestionItem,
    AttachmentSuggestionsRequest,
    AttachmentSuggestionsResponse,
    FollowUpSuggestionsRequest,
    FollowUpSuggestionsResponse,
)
from app.chat.services.history import persist_follow_up_suggestions_for_assistant_message
from app.chat.suggestions.attachments import generate_attachment_suggestions
from app.chat.suggestions.follow_up import generate_follow_up_suggestions
from app.core.database import get_session

router = APIRouter()


@router.post(
    "/follow-up-suggestions",
    response_model=FollowUpSuggestionsResponse,
    summary="根据助手正文生成追问建议（非流式，独立于对话 SSE）",
)
async def follow_up_suggestions_route(
    req: FollowUpSuggestionsRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: Annotated[UserRecord | None, Depends(get_current_user_optional)],
):
    if req.conversation_id:
        await assert_can_use_conversation(
            session,
            req.conversation_id,
            user,
            req.anon_session_secret,
        )
    suggestions = await generate_follow_up_suggestions(
        req.assistant_reply,
        user_question=req.user_question,
    )
    if req.conversation_id:
        await persist_follow_up_suggestions_for_assistant_message(
            session,
            conversation_id=req.conversation_id,
            assistant_message_id=(req.assistant_message_id or "").strip() or None,
            suggestions=suggestions,
            user=user,
            anon_session_secret=req.anon_session_secret,
        )
    return FollowUpSuggestionsResponse(suggestions=suggestions)


@router.post(
    "/attachment-suggestions",
    response_model=AttachmentSuggestionsResponse,
    summary="根据待发送图片生成附图快捷话术（VL 看图）",
)
async def attachment_suggestions_route(
    req: AttachmentSuggestionsRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: Annotated[UserRecord | None, Depends(get_current_user_optional)],
):
    if req.conversation_id:
        await assert_can_use_conversation(
            session,
            req.conversation_id,
            user,
            req.anon_session_secret,
        )
        await session.commit()
    rows = await generate_attachment_suggestions(req.image_urls)
    return AttachmentSuggestionsResponse(
        items=[AttachmentSuggestionItem(label=r["label"], prompt=r["prompt"]) for r in rows],
    )

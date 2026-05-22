"""对话与会话路由聚合。"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.auth.api.deps import get_current_user_optional
from app.auth.models import UserRecord
from app.chat.api import billing, conversations, groups, suggestions
from app.chat.policy.access import assert_can_use_conversation
from app.chat.policy.turns import resolve_chat_turn
from app.chat.schemas import ChatRequest
from app.chat.services.streaming import stream_chat
from app.core.database import async_session_factory

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("", summary="流式对话（SSE），支持会话持久化")
async def chat(
    req: ChatRequest,
    user: Annotated[UserRecord | None, Depends(get_current_user_optional)],
):
    if req.conversation_id:
        async with async_session_factory() as session:
            await assert_can_use_conversation(
                session,
                req.conversation_id,
                user,
                req.anon_session_secret,
            )
            await session.commit()

    try:
        resolved = resolve_chat_turn(
            llm_provider_body=req.llm_provider,
            chat_model_body=req.chat_model,
            deep_think=req.deep_think,
            web_search_enabled=req.web_search_enabled,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    return StreamingResponse(
        stream_chat(
            req.message,
            list(req.history),
            req.agent_id,
            req.conversation_id,
            user,
            req.anon_session_secret,
            req.regenerate_last_reply,
            req.regenerate_from_user_id,
            resolved=resolved,
            resume_kind=req.resume_kind,
            resume_widget_id=req.resume_widget_id,
            resume_trace_id=req.resume_trace_id,
            web_search_mode=req.web_search_mode,
            group_id=req.group_id,
            image_urls=list(req.image_urls),
        ),
        media_type="text/event-stream",
    )


router.include_router(billing.router)
router.include_router(suggestions.router)
router.include_router(conversations.router)
router.include_router(groups.router)

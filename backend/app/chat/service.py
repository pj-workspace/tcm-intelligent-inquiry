"""对话服务：LangGraph 流式输出 + 会话/消息持久化。"""

import json
import secrets
import uuid
from collections.abc import AsyncIterator
from typing import TYPE_CHECKING

from langchain_core.messages import AIMessage, HumanMessage
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.chat.models import ConversationRecord, MessageRecord
from app.chat.schemas import ChatMessage
from app.core.chat_context import chat_user_id
from app.core.database import async_session_factory
from app.core.logging import get_logger
from app.core.safety import STREAM_SAFETY_NOTICE

if TYPE_CHECKING:
    from app.auth.models import UserRecord

logger = get_logger(__name__)


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _extract_text(chunk) -> str:
    content = getattr(chunk, "content", None)
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                parts.append(str(block.get("text", "")))
            elif isinstance(block, str):
                parts.append(block)
        return "".join(parts)
    return ""


def _history_to_lc(history: list[ChatMessage]) -> list[HumanMessage | AIMessage]:
    out: list[HumanMessage | AIMessage] = []
    for m in history:
        if m.role == "user":
            out.append(HumanMessage(content=m.content))
        else:
            out.append(AIMessage(content=m.content))
    return out


async def _messages_to_lc(session: AsyncSession, conversation_id: str) -> list[HumanMessage | AIMessage]:
    r = await session.execute(
        select(MessageRecord)
        .where(MessageRecord.conversation_id == conversation_id)
        .order_by(MessageRecord.created_at)
    )
    rows = r.scalars().all()
    out: list[HumanMessage | AIMessage] = []
    for m in rows:
        if m.role == "user":
            out.append(HumanMessage(content=m.content))
        else:
            out.append(AIMessage(content=m.content))
    return out


async def stream_chat(
    message: str,
    history: list[ChatMessage],
    agent_id: str | None,
    conversation_id: str | None,
    user: "UserRecord | None",
    anon_session_secret: str | None = None,
) -> AsyncIterator[str]:
    from app.agent.executor import build_agent_graph

    user_id = user.id if user else None
    msg_in = message.strip()
    if not msg_in:
        yield _sse({"type": "error", "message": "消息不能为空"})
        yield "data: [DONE]\n\n"
        return

    ctx_token = chat_user_id.set(user_id)
    conv_id: str | None = conversation_id
    effective_agent_id = agent_id

    try:
        yield _sse({"type": "notice", "safetyNotice": STREAM_SAFETY_NOTICE})

        if conv_id:
            async with async_session_factory() as session:
                conv_row = await session.get(ConversationRecord, conv_id)
                if effective_agent_id is None and conv_row is not None:
                    effective_agent_id = conv_row.agent_id

                session.add(
                    MessageRecord(
                        id=str(uuid.uuid4()),
                        conversation_id=conv_id,
                        role="user",
                        content=msg_in,
                    )
                )
                await session.commit()

            async with async_session_factory() as session:
                lc_messages = await _messages_to_lc(session, conv_id)
        else:
            conv_id = str(uuid.uuid4())
            title = msg_in[:200] if len(msg_in) > 200 else msg_in
            anon_sec = secrets.token_hex(32) if user_id is None else None
            async with async_session_factory() as session:
                session.add(
                    ConversationRecord(
                        id=conv_id,
                        user_id=user_id,
                        title=title,
                        agent_id=agent_id,
                        anon_session_secret=anon_sec,
                    )
                )
                session.add(
                    MessageRecord(
                        id=str(uuid.uuid4()),
                        conversation_id=conv_id,
                        role="user",
                        content=msg_in,
                    )
                )
                await session.commit()

            meta: dict = {
                "type": "meta",
                "conversationId": conv_id,
                "agentId": agent_id,
                "safetyNotice": STREAM_SAFETY_NOTICE,
            }
            if anon_sec:
                meta["anonSessionSecret"] = anon_sec
            yield _sse(meta)

            prior = _history_to_lc(history)
            lc_messages = prior + [HumanMessage(content=msg_in)]

        graph = await build_agent_graph(effective_agent_id)

        assistant_parts: list[str] = []

        async for event in graph.astream_events({"messages": lc_messages}, version="v2"):
            etype = event.get("event")

            if etype == "on_chat_model_stream":
                chunk = event.get("data", {}).get("chunk")
                if chunk:
                    delta = _extract_text(chunk)
                    if delta:
                        assistant_parts.append(delta)
                        yield _sse({"type": "text-delta", "textDelta": delta})

            elif etype == "on_tool_start":
                yield _sse({"type": "tool-call", "name": event.get("name", "")})

            elif etype == "on_tool_end":
                yield _sse({"type": "tool-result", "name": event.get("name", "")})

        assistant_text = "".join(assistant_parts)
        async with async_session_factory() as session:
            session.add(
                MessageRecord(
                    id=str(uuid.uuid4()),
                    conversation_id=conv_id,
                    role="assistant",
                    content=assistant_text,
                )
            )
            await session.commit()

        yield "data: [DONE]\n\n"

    except Exception as exc:
        logger.exception("stream_chat error")
        if conv_id:
            try:
                async with async_session_factory() as session:
                    session.add(
                        MessageRecord(
                            id=str(uuid.uuid4()),
                            conversation_id=conv_id,
                            role="assistant",
                            content="（回复生成中断，请稍后重试。）",
                        )
                    )
                    await session.commit()
            except Exception:
                logger.exception("写入中断占位消息失败")
        yield _sse({"type": "error", "message": str(exc)})
        yield "data: [DONE]\n\n"
    finally:
        chat_user_id.reset(ctx_token)

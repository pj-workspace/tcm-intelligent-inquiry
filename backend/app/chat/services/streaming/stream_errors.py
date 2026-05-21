"""流式对话失败时的错误文案与助手消息持久化（与前端 **Error:** 展示对齐）。"""

from __future__ import annotations

import uuid

from sqlalchemy import select

from app.chat.models import MessageRecord
from app.core.database import async_session_factory
from app.core.logging import get_logger

logger = get_logger(__name__)

STREAM_ERROR_MARKDOWN_PREFIX = "**Error:** "
_STREAM_ERROR_MAX = 2000


def sanitize_stream_error_message(message: str, *, max_len: int = _STREAM_ERROR_MAX) -> str:
    """SSE error.message 与入库文案共用的用户可见摘要（不含 Markdown 前缀）。"""
    msg = (message or "").strip().replace("\r\n", "\n")
    if not msg:
        return "回复生成失败，请稍后重试。"
    if len(msg) > max_len:
        return msg[: max_len - 1] + "…"
    return msg


def assistant_error_content_for_storage(message: str) -> str:
    """与前端 useChatStream 中 `**Error:** ${data.message}` 一致，便于刷新后历史对齐。"""
    return f"{STREAM_ERROR_MARKDOWN_PREFIX}{sanitize_stream_error_message(message)}"


async def persist_stream_failure_assistant(
    conversation_id: str,
    *,
    error_message: str,
    model_label: str | None,
) -> None:
    """将本轮失败说明写入助手消息：若已有非空助手正文则追加，否则新建一条。"""
    content = assistant_error_content_for_storage(error_message)
    async with async_session_factory() as session:
        r = await session.execute(
            select(MessageRecord)
            .where(MessageRecord.conversation_id == conversation_id)
            .order_by(MessageRecord.created_at.desc())
            .limit(1)
        )
        last = r.scalar_one_or_none()
        if last is not None and last.role == "assistant":
            body = (last.content or "").strip()
            if body and STREAM_ERROR_MARKDOWN_PREFIX not in body:
                last.content = f"{last.content.rstrip()}\n\n{content}"
                await session.commit()
                return
            if not body:
                last.content = content
                if model_label and not (last.model_name or "").strip():
                    last.model_name = model_label
                await session.commit()
                return
        session.add(
            MessageRecord(
                id=str(uuid.uuid4()),
                conversation_id=conversation_id,
                role="assistant",
                content=content,
                model_name=model_label,
            )
        )
        await session.commit()

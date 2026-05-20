"""用户消息编解码与 LangChain 消息列表转换。"""

import json
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.chat.models import MessageRecord
from app.chat.schemas import ChatMessage


def persist_user_turn_content(text: str, image_urls: list[str]) -> str:
    """入库：无图则仍为纯文案；含图则用 JSON v1（供多模态还原）。"""
    urls = [u for u in image_urls if isinstance(u, str) and u.strip()]
    if not urls:
        return text
    return json.dumps({"v": 1, "text": text, "images": urls}, ensure_ascii=False)


def parse_user_turn_content(raw: str) -> tuple[str, list[str]]:
    s = (raw or "").strip()
    if not s.startswith("{"):
        return raw, []
    try:
        j = json.loads(s)
        if not isinstance(j, dict) or j.get("v") != 1:
            return raw, []
        imgs = j.get("images")
        if not isinstance(imgs, list):
            return raw, []
        urls = [str(x).strip() for x in imgs if isinstance(x, str) and x.strip()]
        txt = j.get("text")
        tx = "" if txt is None else str(txt)
        if not urls:
            return (tx if tx else raw), []
        return tx, urls
    except json.JSONDecodeError:
        return raw, []


def lc_human_user_from_storage(raw: str) -> HumanMessage:
    text, imgs = parse_user_turn_content(raw)
    if imgs:
        blocks: list[dict[str, Any]] = [
            {"type": "image_url", "image_url": {"url": u}} for u in imgs
        ]
        t = (text or "").strip() or "（附图）"
        return HumanMessage(content=[{"type": "text", "text": t}] + blocks)
    raw_s = (raw or "").strip()
    if raw_s.startswith("{") and isinstance(text, str) and text != raw:
        return HumanMessage(content=text or raw)
    return HumanMessage(content=raw)


def user_message_text_for_regenerate_compare(raw: str) -> str:
    tx, imgs = parse_user_turn_content(raw)
    if imgs:
        return tx.strip() if tx.strip() else "（附图）"
    return (tx or "").strip()


def history_to_lc(history: list[ChatMessage]) -> list[HumanMessage | AIMessage]:
    out: list[HumanMessage | AIMessage] = []
    for m in history:
        if m.role == "user":
            out.append(HumanMessage(content=m.content))
        else:
            out.append(AIMessage(content=m.content))
    return out


async def messages_to_lc(
    session: AsyncSession, conversation_id: str
) -> list[HumanMessage | AIMessage]:
    r = await session.execute(
        select(MessageRecord)
        .where(MessageRecord.conversation_id == conversation_id)
        .order_by(MessageRecord.created_at)
    )
    rows = r.scalars().all()
    out: list[HumanMessage | AIMessage] = []
    for m in rows:
        if m.role == "user":
            out.append(lc_human_user_from_storage(m.content))
        elif m.role == "assistant":
            out.append(AIMessage(content=m.content))
    return out

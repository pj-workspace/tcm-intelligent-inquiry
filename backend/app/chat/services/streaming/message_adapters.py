"""用户消息编解码与 LangChain 消息列表转换。"""

import json
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.tools._internal.mark_summary import MARK_SUMMARY_TOOL_NAME
from app.chat.models import MessageRecord
from app.chat.schemas import ChatMessage


def _fake_mark_summary_history_pair(
    record_id: str,
) -> list[AIMessage | ToolMessage]:
    """伪造一次 mark_summary 工具调用历史（AIMessage.tool_calls + ToolMessage 配对）。

    场景：前端在 SSE 层把 mark_summary 调用隐藏掉了，但 langchain 历史里如果完全
    不出现这次调用，模型在第二轮 ReAct 中往往会"忘记"主动调 mark_summary（看不
    到自己上轮的 pattern 就当成可选）。在 history 转换时把它"还原"出来，让模型
    看到一致的 ReAct 调用范式，能显著提升后续轮次的调用率。

    tool_call_id 用持久化记录的主键派生，避免与本轮真实 tool_call 冲突。
    """
    fake_tool_call_id = f"mark_summary_history_{record_id}"
    ai_msg = AIMessage(
        content="",
        tool_calls=[
            {
                "name": MARK_SUMMARY_TOOL_NAME,
                "args": {},
                "id": fake_tool_call_id,
                "type": "tool_call",
            }
        ],
    )
    tool_msg = ToolMessage(
        content="",
        tool_call_id=fake_tool_call_id,
        name=MARK_SUMMARY_TOOL_NAME,
    )
    return [ai_msg, tool_msg]


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
) -> list[HumanMessage | AIMessage | ToolMessage]:
    r = await session.execute(
        select(MessageRecord)
        .where(MessageRecord.conversation_id == conversation_id)
        .order_by(MessageRecord.created_at)
    )
    rows = r.scalars().all()
    out: list[HumanMessage | AIMessage | ToolMessage] = []
    for m in rows:
        if m.role == "user":
            out.append(lc_human_user_from_storage(m.content))
        elif m.role == "assistant":
            out.append(AIMessage(content=m.content))
        elif m.role == "summary-mark":
            # 还原 mark_summary 调用 → 让模型在第二轮看到自己上轮调用过此工具
            out.extend(_fake_mark_summary_history_pair(m.id))
    return out

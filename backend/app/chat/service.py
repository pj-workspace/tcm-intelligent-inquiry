"""对话服务：LangGraph 流式输出 + 会话/消息持久化。"""

import json
import secrets
import uuid
from collections.abc import AsyncIterator, Iterator
from typing import TYPE_CHECKING, Any

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
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

_TOOL_IO_MAX = 8000
_THINKING_MAX = 16000


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _truncate(s: str, max_len: int) -> str:
    if len(s) <= max_len:
        return s
    return s[: max_len - 1] + "…"


def _json_safe_for_sse(obj: Any, max_str: int = _TOOL_IO_MAX, depth: int = 0) -> Any:
    """将工具入参等转为可 JSON 序列化结构，并限制深度与字符串长度。"""
    if depth > 12:
        return "…"
    if obj is None or isinstance(obj, (bool, int, float)):
        return obj
    if isinstance(obj, str):
        return _truncate(obj, max_str)
    if isinstance(obj, dict):
        out: dict[str, Any] = {}
        for i, (k, v) in enumerate(obj.items()):
            if i >= 40:
                out["…"] = f"共 {len(obj)} 项，已省略"
                break
            out[str(k)[:200]] = _json_safe_for_sse(v, max_str, depth + 1)
        return out
    if isinstance(obj, (list, tuple)):
        return [_json_safe_for_sse(x, max_str, depth + 1) for x in obj[:40]]
    return _truncate(str(obj), max_str)


def _serialize_tool_output(out: Any) -> str:
    """工具结束时的 output 预览（供前端展示，非全量日志）。"""
    if out is None:
        return ""
    if isinstance(out, ToolMessage):
        c = out.content
        if isinstance(c, str):
            return _truncate(c, _TOOL_IO_MAX)
        if isinstance(c, list):
            parts: list[str] = []
            for b in c:
                if isinstance(b, dict) and b.get("type") == "text":
                    parts.append(str(b.get("text", "")))
                elif isinstance(b, str):
                    parts.append(b)
            return _truncate("".join(parts), _TOOL_IO_MAX)
        return _truncate(json.dumps(c, ensure_ascii=False), _TOOL_IO_MAX)
    if isinstance(out, AIMessage):
        return _truncate(str(out.content), _TOOL_IO_MAX)
    if hasattr(out, "content"):
        return _serialize_tool_output(getattr(out, "content"))
    return _truncate(str(out), _TOOL_IO_MAX)


def _extract_text(chunk) -> str:
    """仅提取可见回复正文（兼容旧逻辑）。"""
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


def _iter_model_stream_parts(chunk) -> Iterator[tuple[str, str]]:
    """从 chat_model_stream chunk 拆出 (kind, delta)，kind 为 text 或 thinking。"""
    content = getattr(chunk, "content", None)
    if isinstance(content, str):
        if content:
            yield "text", content
        return
    if not isinstance(content, list):
        return
    for block in content:
        if isinstance(block, dict):
            bt = str(block.get("type") or "")
            if bt == "text":
                t = str(block.get("text", ""))
                if t:
                    yield "text", t
            elif bt in (
                "thinking",
                "reasoning",
                "redacted_reasoning",
            ):
                raw = (
                    block.get("thinking")
                    or block.get("reasoning")
                    or block.get("text")
                    or ""
                )
                if raw:
                    yield "thinking", _truncate(str(raw), _THINKING_MAX)
        elif isinstance(block, str) and block:
            yield "text", block


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
            data = event.get("data") if isinstance(event.get("data"), dict) else {}
            run_id = event.get("run_id")

            if etype == "on_chat_model_stream":
                chunk = data.get("chunk")
                if chunk:
                    streamed = False
                    for kind, delta in _iter_model_stream_parts(chunk):
                        if not delta:
                            continue
                        streamed = True
                        if kind == "text":
                            assistant_parts.append(delta)
                            yield _sse({"type": "text-delta", "textDelta": delta})
                        else:
                            yield _sse({"type": "thinking-delta", "textDelta": delta})
                    if not streamed:
                        delta = _extract_text(chunk)
                        if delta:
                            assistant_parts.append(delta)
                            yield _sse({"type": "text-delta", "textDelta": delta})

            elif etype == "on_tool_start":
                name = event.get("name") or ""
                raw_in = data.get("input")
                if raw_in is None:
                    raw_in = data.get("tool_input")
                payload: dict[str, Any] = {
                    "type": "tool-call",
                    "name": name,
                }
                if run_id is not None:
                    payload["runId"] = run_id
                if raw_in is not None:
                    payload["input"] = _json_safe_for_sse(raw_in)
                yield _sse(payload)

            elif etype == "on_tool_end":
                name = event.get("name") or ""
                out = data.get("output")
                preview = _serialize_tool_output(out)
                tr: dict[str, Any] = {
                    "type": "tool-result",
                    "name": name,
                }
                if run_id is not None:
                    tr["runId"] = run_id
                if preview:
                    tr["outputPreview"] = preview
                yield _sse(tr)

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

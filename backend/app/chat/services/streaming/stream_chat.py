"""LangGraph 流式对话主编排。"""

import asyncio
import json
import secrets
import time
import uuid
from collections.abc import AsyncIterator
from typing import TYPE_CHECKING, Any, Literal

from langchain_core.messages import ToolMessage
from sqlalchemy import delete, select

from app.agent.executor import build_agent_graph_for_chat_request
from app.agent.tools._internal.citations import (
    citation_sources_snapshot,
    reset_citation_sources,
)
from app.agent.tools._internal.mark_summary import MARK_SUMMARY_TOOL_NAME
from app.mcp.bridge.tool_bridge import mcp_tool_sse_metadata
from app.chat.images.vl_sanitize import (
    collect_unique_image_urls_from_messages,
    ensure_urls_probed,
    filter_image_urls_by_probe_cache,
    sanitize_messages_for_text_only_images,
    sanitize_messages_for_vl_images,
)
from app.chat.models import ConversationRecord, MessageRecord
from app.chat.policy.turns import ResolvedChatTurn
from app.chat.secrets import build_form_resume_hint, store_form_secrets
from app.chat.secrets.constants import FORM_SUBMIT_USER_PLACEHOLDER
from app.chat.schemas import ChatMessage
from app.chat.services.groups import assert_own_group
from app.chat.services.streaming.chunk_parsers import (
    extract_text,
    iter_model_stream_parts,
)
from app.chat.services.streaming.message_adapters import (
    history_to_lc,
    lc_human_user_from_storage,
    messages_to_lc,
    persist_user_turn_content,
    user_message_text_for_regenerate_compare,
)
from app.chat.services.streaming.sse import (
    json_safe_for_sse,
    serialize_tool_output,
    sse,
    sse_done,
    tool_output_indicates_error,
    truncate,
)
from app.chat.services.streaming.stream_errors import (
    persist_stream_failure_assistant,
    sanitize_stream_error_message,
)
from app.chat.services.streaming.title import generate_title_async, meta_chat_model_label
from app.core.ai_chat_trace import (
    format_chat_model_stream_chunk_raw,
    format_llm_turn_request,
    format_stream_aggregate_summary,
    format_tool_event_raw,
    serialize_tool_output_for_raw_log,
)
from app.core.chat_context import chat_agent_kb_id, chat_conversation_id, chat_user_id
from app.core.config import get_settings
from app.core.database import async_session_factory
from app.core.logging import get_logger
from app.core.safety import STREAM_SAFETY_NOTICE
from app.llm.billing.normalize import sanitize_usage_for_json
from app.llm.billing.persist_usage import insert_llm_usage_event
from app.llm.billing.usage_from_chunk import (
    build_usage_emit_signature,
    maybe_llm_usage_sse_payload,
    merged_usage_dict,
    usage_sources_from_chunk,
)

if TYPE_CHECKING:
    from app.auth.models import UserRecord

logger = get_logger(__name__)


def _build_aborted_tool_record(
    meta: dict[str, Any],
    run_id: str | None,
) -> dict[str, Any]:
    """构造中止/超时收尾时的工具记录 JSON 内容。"""
    name = str(meta.get("name") or "tool").strip() or "tool"
    rec: dict[str, Any] = {
        "name": name,
        "status": "error",
        "aborted": True,
    }
    rec.update(mcp_tool_sse_metadata(name))
    inp = meta.get("input")
    if inp is not None:
        rec["input"] = inp
    if run_id:
        rec["runId"] = run_id
    return rec


async def _persist_interrupt_mark(conv_id: str) -> None:
    """写一条 role=interrupt-mark 的零内容标记记录。

    前端 ``groupMessagesIntoTraces`` 按时间顺序处理消息时，遇到 interrupt-mark
    会把它**前面最近一条** assistant 消息标为 ``interrupted=true``——刷新历史
    时仍能看到「输出已被终止」尾巴；如果前面没有 assistant 消息（罕见：abort
    发生在 trace 阶段还没产生任何 assistant 文本时），前端在该位置追加一条
    interrupted 空气泡占位。
    """
    async with async_session_factory() as session:
        session.add(
            MessageRecord(
                id=str(uuid.uuid4()),
                conversation_id=conv_id,
                role="interrupt-mark",
                content="",
            )
        )
        await session.commit()


async def _persist_summary_mark(conv_id: str) -> None:
    """写一条 role=summary-mark 的零内容标记记录。"""
    async with async_session_factory() as session:
        session.add(
            MessageRecord(
                id=str(uuid.uuid4()),
                conversation_id=conv_id,
                role="summary-mark",
                content="",
            )
        )
        await session.commit()


async def _persist_pending_tools_as_aborted(
    conv_id: str,
    pending_by_run: dict[str, dict[str, Any]],
    pending_fifo: list[dict[str, Any]],
) -> None:
    """将仍 running 的工具写入历史，标记 aborted=True。"""
    rows: list[dict[str, Any]] = []
    for run_id, meta in pending_by_run.items():
        rows.append(_build_aborted_tool_record(meta, run_id))
    for meta in pending_fifo:
        rows.append(_build_aborted_tool_record(meta, None))
    if not rows:
        return
    async with async_session_factory() as session:
        for rec in rows:
            session.add(
                MessageRecord(
                    id=str(uuid.uuid4()),
                    conversation_id=conv_id,
                    role="tool",
                    content=json.dumps(rec, ensure_ascii=False),
                )
            )
        await session.commit()


async def stream_chat(
    message: str,
    history: list[ChatMessage],
    agent_id: str | None,
    conversation_id: str | None,
    user: "UserRecord | None",
    anon_session_secret: str | None = None,
    regenerate_last_reply: bool = False,
    regenerate_from_user_id: str | None = None,
    *,
    resolved: ResolvedChatTurn,
    resume_kind: Literal["ask_user"] | None = None,
    resume_widget_id: str | None = None,
    resume_trace_id: str | None = None,
    web_search_mode: Literal["force", "auto"] = "force",
    group_id: str | None = None,
    image_urls: list[str] | None = None,
    form_submission: dict[str, str] | None = None,
) -> AsyncIterator[str]:
    """流式执行一轮对话并通过 SSE 帧增量推送事件。

    编排 LangGraph Agent、工具调用、引用来源、用量计费与中断/恢复逻辑；
    每个 ``yield`` 为一条 ``data: {...}\\n\\n`` 帧，末尾发送 ``[DONE]``。

    Args:
        message: 用户输入正文；仅附图时可空（会写入「（附图）」占位）。
        history: 前端传入的历史消息（新建会话时为空）。
        agent_id: 指定 Agent 配置；空则使用默认图。
        conversation_id: 已有会话 ID；空则创建新会话。
        user: 登录用户；匿名时为 ``None``。
        anon_session_secret: 匿名会话密钥（``X-Anonymous-Session``）。
        regenerate_last_reply: 是否重新生成上一轮助手回复。
        regenerate_from_user_id: 重新生成时锚定的 user 消息 ID。
        resolved: 由 ``resolve_chat_turn`` 解析的模型/厂商/权限上下文。
        resume_kind: 中断恢复类型（目前仅 ``ask_user``）。
        resume_widget_id: ask_user 组件 ID。
        resume_trace_id: 恢复所属 trace ID。
        web_search_mode: 联网检索策略（``force`` / ``auto``）。
        group_id: 会话分组 ID。
        image_urls: 附图 OSS 签名 URL 列表。
        form_submission: ask_user 表单恢复时的字段值（加密存 Vault，15 分钟有效）。

    Yields:
        SSE 格式字符串（``sse()`` / ``sse_done()`` 产出）。
    """
    vl_ok_cache: dict[str, bool] = {}

    raw_urls = [u.strip() for u in (image_urls or ()) if isinstance(u, str) and u.strip()]
    had_request_images = bool(raw_urls)

    user_id = user.id if user else None

    if raw_urls:
        await ensure_urls_probed(list(dict.fromkeys(raw_urls)), ok_cache=vl_ok_cache)
        urls = filter_image_urls_by_probe_cache(raw_urls, vl_ok_cache)
    else:
        urls = []

    msg_in = message.strip()
    if not msg_in and urls:
        msg_in = "（附图）"
    is_ask_user_resume = resume_kind == "ask_user" and bool(resume_widget_id)
    is_form_resume = is_ask_user_resume and bool(form_submission)
    if not msg_in and not urls and not is_form_resume:
        if had_request_images:
            yield sse(
                {
                    "type": "error",
                    "message": "所附图片尺寸过小或无法读取，模型无法处理，请更换每张宽、高均大于 10 像素的图片后重试。",
                }
            )
        else:
            yield sse({"type": "error", "message": "消息不能为空"})
        yield sse_done()
        return

    if is_form_resume:
        if not conversation_id:
            yield sse({"type": "error", "message": "表单恢复需要已有会话（conversation_id）。"})
            yield sse_done()
            return
        try:
            stored_fields = await store_form_secrets(
                conversation_id=conversation_id,
                widget_id=resume_widget_id or "",
                fields=form_submission or {},
            )
        except ValueError as exc:
            yield sse({"type": "error", "message": str(exc)})
            yield sse_done()
            return
        msg_in = build_form_resume_hint(resume_widget_id or "", stored_fields)
        persist_user_body = FORM_SUBMIT_USER_PLACEHOLDER.format(
            widget_id=resume_widget_id or ""
        )
    else:
        persist_user_body = persist_user_turn_content(msg_in, urls)

    # 恢复 ask_user 是一条新的用户输入，不是重新生成。这里在后端强制兜底，
    # 避免客户端旧状态把 regenerate_last_reply=true 一起带上导致内容比对误报。
    if is_ask_user_resume:
        regenerate_last_reply = False
    regenerate_from_user_id = (regenerate_from_user_id or "").strip() or None
    if regenerate_from_user_id:
        regenerate_last_reply = True
    if regenerate_last_reply and not conversation_id:
        yield sse({"type": "error", "message": "重新生成需要已有会话（conversation_id）。"})
        yield sse_done()
        return
    if group_id is not None and not conversation_id and user is None:
        yield sse({"type": "error", "message": "请先登录后再在分组内新建会话。"})
        yield sse_done()
        return

    ctx_token = chat_user_id.set(user_id)
    conv_ctx_token: object | None = None
    kb_ctx_token: object | None = None
    conv_id: str | None = conversation_id
    effective_agent_id = agent_id
    is_new_conversation = False
    title_task = None
    title_yielded = False

    chat_trace = False
    trace_visible_parts: list[str] = []
    trace_thinking_parts: list[str] = []
    flush_thinking_fn = None
    flush_assistant_fn = None
    # ── 引用来源（请求级 ContextVar，见 app.agent.tools._internal.citations）────
    # 每轮对话开始时清空；工具 on_tool_end 增量下发 sources + source-registry；
    # flush_assistant_segment 入库时快照全量 citations 到 MessageRecord。
    reset_citation_sources()
    last_source_emit_index = 0

    # 已开始但未结束的工具调用：用于在中止/异常时持久化为「已终止」状态，
    # 保证前端刷新后历史仍能看到该次工具调用而不是凭空消失。
    tool_pending_by_run: dict[str, dict[str, Any]] = {}
    tool_pending_fifo: list[dict[str, Any]] = []
    # think 模式 + mark_summary 信号：模型调用 mark_summary 工具后置 True，
    # 之后的 text-delta 视为"最终答案"，flush 入库为 role=assistant；
    # 之前的 text-delta 视为"过渡话术"，flush 入库为 role=thinking。
    in_summary_phase: bool = False
    # mark_summary 之后模型违反约束又调用的工具 run_id 集合，让 on_tool_end 跳过它们；
    # abort 路径也会忽略这些，不会写入"已终止"记录。
    ignored_post_summary_runs: set[str] = set()
    # finally 阶段判断"客户端中止"用：流正常结束 / SSE 错误路径都会显式置位，
    # 都没置位说明客户端断连（generator 被回收 → CancelledError → finally）。
    stream_completed_normally: bool = False
    stream_errored: bool = False

    try:
        yield sse({"type": "notice", "safetyNotice": STREAM_SAFETY_NOTICE})

        anon_sec: str | None = None
        if conv_id:
            async with async_session_factory() as session:
                conv_row = await session.get(ConversationRecord, conv_id)
                if effective_agent_id is None and conv_row is not None:
                    effective_agent_id = conv_row.agent_id

                if regenerate_last_reply:
                    r = await session.execute(
                        select(MessageRecord)
                        .where(MessageRecord.conversation_id == conv_id)
                        .order_by(MessageRecord.created_at)
                    )
                    rows = r.scalars().all()
                    target_user_i = -1
                    if regenerate_from_user_id:
                        for i, m in enumerate(rows):
                            if m.id == regenerate_from_user_id and m.role == "user":
                                target_user_i = i
                                break
                    else:
                        for i, m in enumerate(rows):
                            if m.role == "user":
                                target_user_i = i
                    if target_user_i < 0:
                        yield sse(
                            {
                                "type": "error",
                                "message": "无法重新生成：未找到对应的用户消息。",
                            }
                        )
                        yield sse_done()
                        return
                    if user_message_text_for_regenerate_compare(
                        rows[target_user_i].content
                    ) != msg_in:
                        yield sse(
                            {
                                "type": "error",
                                "message": "重新生成失败：内容与目标用户消息不一致。",
                            }
                        )
                        yield sse_done()
                        return
                    tail_ids = [m.id for m in rows[target_user_i + 1 :]]
                    if tail_ids:
                        await session.execute(
                            delete(MessageRecord).where(MessageRecord.id.in_(tail_ids))
                        )
                else:
                    session.add(
                        MessageRecord(
                            id=str(uuid.uuid4()),
                            conversation_id=conv_id,
                            role="user",
                            content=persist_user_body,
                        )
                    )
                await session.commit()

            async with async_session_factory() as session:
                lc_messages = await messages_to_lc(session, conv_id)
        else:
            is_new_conversation = True
            conv_id = str(uuid.uuid4())
            title = "新会话"
            anon_sec = secrets.token_hex(32) if user_id is None else None

            gid_for_conv: str | None = None
            if group_id is not None:
                assert user is not None
                async with async_session_factory() as session:
                    await assert_own_group(session, group_id, user)
                gid_for_conv = group_id

            async with async_session_factory() as session:
                session.add(
                    ConversationRecord(
                        id=conv_id,
                        user_id=user_id,
                        title=title,
                        agent_id=agent_id,
                        anon_session_secret=anon_sec,
                        group_id=gid_for_conv,
                    )
                )
                session.add(
                    MessageRecord(
                        id=str(uuid.uuid4()),
                        conversation_id=conv_id,
                        role="user",
                        content=persist_user_body,
                    )
                )
                await session.commit()

            prior = history_to_lc(history)
            lc_messages = prior + [lc_human_user_from_storage(persist_user_body)]

            title_task = asyncio.create_task(
                generate_title_async(
                    msg_in,
                    conv_id,
                    chat_model_id=resolved.llm_chat_model_id,
                    llm_provider=resolved.effective_llm_provider,
                )
            )

        async with async_session_factory() as session:
            conv_for_agent = await session.get(ConversationRecord, conv_id)
            if conv_for_agent is not None and conv_for_agent.agent_id != effective_agent_id:
                conv_for_agent.agent_id = effective_agent_id
                await session.commit()

        meta_out: dict[str, Any] = {
            "type": "meta",
            "conversationId": conv_id,
            "agentId": effective_agent_id,
            "chatModel": meta_chat_model_label(resolved),
            "safetyNotice": STREAM_SAFETY_NOTICE,
        }
        if is_ask_user_resume:
            meta_out["resume"] = {
                "kind": "ask_user",
                "widgetId": resume_widget_id,
                "traceId": resume_trace_id,
            }
        if anon_sec:
            meta_out["anonSessionSecret"] = anon_sec
        yield sse(meta_out)

        agent_kb_id: str | None = None
        if effective_agent_id:
            from app.agent.models import AgentRecord

            async with async_session_factory() as session:
                arow = await session.get(AgentRecord, effective_agent_id)
                if arow is not None and getattr(arow, "default_kb_id", None):
                    agent_kb_id = str(arow.default_kb_id).strip() or None
        kb_ctx_token = chat_agent_kb_id.set(agent_kb_id)
        conv_ctx_token = chat_conversation_id.set(conv_id)

        graph = await build_agent_graph_for_chat_request(
            effective_agent_id,
            llm_provider_effective=resolved.effective_llm_provider,
            chat_model_override=resolved.llm_chat_model_id,
            effective_deep_think=resolved.effective_deep_think,
            effective_web_search=resolved.effective_web_search,
            web_search_mode=web_search_mode,
            effective_tool_calling=resolved.effective_tool_calling,
        )

        uniq_in_messages = collect_unique_image_urls_from_messages(lc_messages)
        await ensure_urls_probed(uniq_in_messages, ok_cache=vl_ok_cache)
        lc_messages = sanitize_messages_for_vl_images(lc_messages, vl_ok_cache)
        if (resolved.effective_llm_provider or "").strip().lower() == "deepseek":
            lc_messages = sanitize_messages_for_text_only_images(lc_messages)

        chat_trace = bool(get_settings().ai_chat_trace_log)
        if chat_trace:
            trace_meta = {
                "conversation_id": conv_id,
                "agent_id": effective_agent_id,
                "chat_model": meta_chat_model_label(resolved),
                "effective_deep_think": resolved.effective_deep_think,
                "effective_web_search": resolved.effective_web_search,
                "web_search_mode": web_search_mode,
                "effective_tool_calling": resolved.effective_tool_calling,
                "regenerate_last_reply": regenerate_last_reply,
            }
            logger.info("\n%s", format_llm_turn_request(lc_messages, meta=trace_meta))

        assistant_parts: list[str] = []
        thinking_buf: list[str] = []
        thinking_t0: float | None = None
        trace_stream_rm_merged: dict[str, Any] = {}
        _break_after_widget: bool = False
        seen_llm_usage_sigs: set[str] = set()

        async def flush_thinking_segment() -> None:
            """Flush thinking segment."""
            nonlocal thinking_buf, thinking_t0
            if not thinking_buf or thinking_t0 is None:
                return
            dur = round(time.monotonic() - thinking_t0, 2)
            text = "".join(thinking_buf)
            thinking_buf = []
            thinking_t0 = None
            async with async_session_factory() as session:
                session.add(
                    MessageRecord(
                        id=str(uuid.uuid4()),
                        conversation_id=conv_id,
                        role="thinking",
                        content=text,
                        duration_sec=dur,
                    )
                )
                await session.commit()

        async def flush_assistant_segment(*, interim: bool = False) -> None:
            """flush 助手正文段。

            - ``interim=False``：当作"最终回答"持久化，``role=assistant``，附带模型名。
            - ``interim=True`` 且开启了深度思考、**且尚未进入 summary 阶段**：当作
              "过程中的过渡话术"持久化为 ``role=thinking``，前端历史聚合时归入 trace。
            - 一旦 ``in_summary_phase=True``（mark_summary 已触发），后续所有 flush 一律
              视为最终答案：写 ``role=assistant``，无视 ``interim`` 参数。
            """
            nonlocal assistant_parts
            if not assistant_parts:
                return
            text = "".join(assistant_parts)
            assistant_parts.clear()
            if interim and resolved.effective_deep_think and not in_summary_phase:
                async with async_session_factory() as session:
                    session.add(
                        MessageRecord(
                            id=str(uuid.uuid4()),
                            conversation_id=conv_id,
                            role="thinking",
                            content=text,
                        )
                    )
                    await session.commit()
                return
            lbl = meta_chat_model_label(resolved)
            # 与 SSE source-registry 终态一致：持久化本轮已登记的全部来源（非仅增量）。
            citations = citation_sources_snapshot()
            async with async_session_factory() as session:
                session.add(
                    MessageRecord(
                        id=str(uuid.uuid4()),
                        conversation_id=conv_id,
                        role="assistant",
                        content=text,
                        model_name=lbl,
                        citations=citations or None,
                    )
                )
                await session.commit()

        flush_thinking_fn = flush_thinking_segment
        flush_assistant_fn = flush_assistant_segment

        async def enter_summary_phase(source: str) -> bool:
            """进入最终答案阶段；返回 True 表示本次真的触发了 summary-start。"""
            nonlocal in_summary_phase
            if in_summary_phase:
                return False
            await flush_thinking_segment()
            # 信号前的 assistant 文本是真正的"过渡话术"，按 interim 入库。
            await flush_assistant_segment(interim=True)
            in_summary_phase = True
            await _persist_summary_mark(conv_id)
            logger.info("%s → summary-start", source)
            if chat_trace:
                logger.info(
                    "\n%s",
                    format_tool_event_raw(
                        f"{source}（发 summary-start）",
                        {"name": MARK_SUMMARY_TOOL_NAME},
                    ),
                )
            return True

        async for event in graph.astream_events(
            {"messages": lc_messages},
            version="v2",
            config={"recursion_limit": 40},
        ):
            if title_task and not title_yielded and title_task.done():
                title_yielded = True
                try:
                    new_title = title_task.result()
                    yield sse(
                        {"type": "title-updated", "title": new_title, "conversationId": conv_id}
                    )
                except Exception:
                    yield sse(
                        {
                            "type": "title-updated",
                            "title": truncate(msg_in, 10),
                            "conversationId": conv_id,
                        }
                    )

            etype = event.get("event")
            data = event.get("data") if isinstance(event.get("data"), dict) else {}
            run_id = event.get("run_id")

            if etype == "on_chat_model_stream":
                chunk = data.get("chunk")
                if chunk:
                    if chat_trace:
                        logger.info("\n%s", format_chat_model_stream_chunk_raw(chunk))
                        rm_cm = getattr(chunk, "response_metadata", None)
                        if isinstance(rm_cm, dict):
                            trace_stream_rm_merged.update(rm_cm)
                        for kind, rdelta in iter_model_stream_parts(
                            chunk, truncate_output=False
                        ):
                            if rdelta:
                                if kind == "text":
                                    trace_visible_parts.append(rdelta)
                                else:
                                    trace_thinking_parts.append(rdelta)
                    streamed = False
                    post_summary_thinking_chars = 0
                    for kind, delta in iter_model_stream_parts(chunk):
                        if not delta:
                            continue
                        streamed = True
                        if kind == "text":
                            if resolved.effective_deep_think and not in_summary_phase:
                                # 兜底（已暂时关闭）：模型忘记 mark_summary 却已经开始输出可见文本时，
                                # 自动发 summary-start。关闭后改由 mark_summary 显式触发，或流结束时
                                # 前端 promotePendingInterim 兜底；避免 ask_user 短提示误触 summary。
                                # if await enter_summary_phase("auto mark_summary fallback before text"):
                                #     yield sse({"type": "summary-start"})
                                pass
                            else:
                                await flush_thinking_segment()
                            assistant_parts.append(delta)
                            yield sse({"type": "text-delta", "textDelta": delta})
                        else:
                            # mark_summary 之后模型违反 prompt 约束又输出 reasoning：
                            # 静默丢弃，**不发 SSE 也不入 thinking_buf 也不入库**，
                            # 避免前端在 summary 阶段后开新 trace 头。
                            if in_summary_phase:
                                post_summary_thinking_chars += len(delta)
                                continue
                            if assistant_parts:
                                # 后面紧跟 thinking → 之前那段 assistant 文本是过渡，
                                # think 模式下入库为 role=thinking
                                await flush_assistant_segment(interim=True)
                            if thinking_t0 is None:
                                thinking_t0 = time.monotonic()
                            thinking_buf.append(delta)
                            yield sse({"type": "thinking-delta", "textDelta": delta})
                    if post_summary_thinking_chars > 0:
                        # INFO 级日志（非 ai_chat_trace 也可见），便于统计模型"反悔"率
                        logger.info(
                            "summary 阶段丢弃 thinking-delta: %d 字符（模型在 mark_summary 后又输出 reasoning）",
                            post_summary_thinking_chars,
                        )
                    if not streamed:
                        delta = extract_text(chunk)
                        if delta:
                            if resolved.effective_deep_think and not in_summary_phase:
                                # 同上：auto mark_summary fallback 已暂时关闭
                                # if await enter_summary_phase("auto mark_summary fallback before text"):
                                #     yield sse({"type": "summary-start"})
                                pass
                            else:
                                await flush_thinking_segment()
                            assistant_parts.append(delta)
                            if chat_trace:
                                trace_visible_parts.append(delta)
                            yield sse({"type": "text-delta", "textDelta": delta})

                    eff_pv = (resolved.effective_llm_provider or "").strip().lower()
                    if eff_pv:
                        lu_payload = maybe_llm_usage_sse_payload(
                            provider_id=eff_pv,
                            graph_run_id=str(run_id) if run_id is not None else None,
                            chat_model=resolved.llm_chat_model_id,
                            chunk=chunk,
                        )
                        if lu_payload:
                            merged_u = merged_usage_dict(chunk)
                            sig_u = build_usage_emit_signature(
                                str(run_id) if run_id is not None else None,
                                merged_u,
                            )
                            if sig_u not in seen_llm_usage_sigs:
                                seen_llm_usage_sigs.add(sig_u)
                                um_u, rm_u = usage_sources_from_chunk(chunk)
                                raw_u = sanitize_usage_for_json(merged_u)
                                if not isinstance(raw_u, dict):
                                    raw_u = {}
                                lu_out = dict(lu_payload)
                                try:
                                    async with async_session_factory() as session_u:
                                        eid_u = await insert_llm_usage_event(
                                            session_u,
                                            user_id=user_id,
                                            conversation_id=conv_id,
                                            provider_id=eff_pv,
                                            chat_model=resolved.llm_chat_model_id,
                                            graph_run_id=str(run_id)
                                            if run_id is not None
                                            else None,
                                            usage_raw=raw_u,
                                            usage_meta=um_u,
                                            response_meta=rm_u,
                                        )
                                        await session_u.commit()
                                    lu_out["usageEventId"] = eid_u
                                except Exception:
                                    logger.exception("llm_usage_events persist failed")
                                yield sse(lu_out)

            elif etype == "on_tool_start":
                name = event.get("name") or ""
                # ── 内部信号工具：mark_summary ────────────────────────────────
                # think 模式独有；不对前端发 tool-call / tool-result，不入库 tool 记录，
                # 改为发出 ``summary-start`` 信号让前端切到"最终答案阶段"。
                if name == MARK_SUMMARY_TOOL_NAME:
                    if await enter_summary_phase("on_tool_start mark_summary（已短路）"):
                        yield sse({"type": "summary-start"})
                    continue
                # 已进入 summary 阶段后再来其他工具：按"模型违反约束"处理，
                # 静默丢弃 tool-call，不写 SSE、不入 pending、也不让 tool_end 走正常流程
                if in_summary_phase:
                    if chat_trace:
                        logger.info(
                            "\n%s",
                            format_tool_event_raw(
                                "post-summary tool-call 被忽略",
                                {"name": name, "run_id": run_id},
                            ),
                        )
                    if run_id is not None:
                        ignored_post_summary_runs.add(str(run_id))
                    continue
                await flush_thinking_segment()
                # tool 前的 assistant 文本必然是过渡话术；think 模式下入库为 role=thinking，
                # 与前端 `pendingInterimStepId` 在 tool-call 时固化为 thinking step 对齐
                await flush_assistant_segment(interim=True)
                raw_in = data.get("input")
                if raw_in is None:
                    raw_in = data.get("tool_input")
                if name in ("ask_user", "ask_user_form"):
                    payload: dict[str, Any] = {
                        "type": "ask-user-start",
                        "name": name,
                    }
                    if run_id is not None:
                        payload["runId"] = run_id
                    if raw_in is not None:
                        payload["input"] = json_safe_for_sse(raw_in)
                    yield sse(payload)
                    continue
                if run_id is not None:
                    tool_pending_by_run[str(run_id)] = {
                        "name": name,
                        "input": json_safe_for_sse(raw_in) if raw_in is not None else None,
                    }
                else:
                    tool_pending_fifo.append(
                        {
                            "name": name,
                            "input": json_safe_for_sse(raw_in) if raw_in is not None else None,
                        }
                    )
                payload: dict[str, Any] = {
                    "type": "tool-call",
                    "name": name,
                }
                payload.update(mcp_tool_sse_metadata(name))
                if run_id is not None:
                    payload["runId"] = run_id
                if raw_in is not None:
                    payload["input"] = json_safe_for_sse(raw_in)
                if chat_trace:
                    logger.info(
                        "\n%s",
                        format_tool_event_raw(
                            "on_tool_start（原始输入，非 SSE 裁剪）",
                            {"name": name, "run_id": run_id, "input": raw_in},
                        ),
                    )
                yield sse(payload)

            elif etype == "on_tool_end":
                name = event.get("name") or ""
                # 短路：mark_summary 在 on_tool_start 已发 summary-start，这里完全静默
                if name == MARK_SUMMARY_TOOL_NAME:
                    continue
                # 短路：summary 阶段后被丢弃的工具，运行结果也不上报
                run_key_check = str(run_id) if run_id is not None else None
                if (
                    run_key_check is not None
                    and run_key_check in ignored_post_summary_runs
                ):
                    ignored_post_summary_runs.discard(run_key_check)
                    continue
                out = data.get("output")
                _widget_sse: dict[str, Any] | None = None
                _raw_out_str = ""
                if isinstance(out, ToolMessage):
                    _raw_out_str = str(out.content or "")
                elif isinstance(out, str):
                    _raw_out_str = out
                if _raw_out_str:
                    try:
                        _wparsed = json.loads(_raw_out_str)
                        if isinstance(_wparsed, dict) and _wparsed.get("__widget__") is True:
                            wt = str(_wparsed.get("widgetType") or "choice")
                            _widget_sse = {
                                "type": "widget",
                                "widgetId": str(_wparsed.get("widgetId") or ""),
                                "widgetType": wt,
                                "question": str(_wparsed.get("question") or ""),
                            }
                            if wt == "form":
                                _widget_sse["fields"] = _wparsed.get("fields") or []
                            else:
                                _widget_sse["choices"] = [
                                    str(c) for c in (_wparsed.get("choices") or [])
                                ]
                                _widget_sse["allowFreeText"] = bool(
                                    _wparsed.get("allowFreeText", True)
                                )
                    except (json.JSONDecodeError, TypeError):
                        pass
                preview = ""
                if _widget_sse:
                    if _widget_sse.get("widgetType") == "form":
                        preview = f"[表单] {_widget_sse['question']}"
                    else:
                        preview = f"[选择框] {_widget_sse['question']}"
                elif _raw_out_str:
                    preview = serialize_tool_output(out)
                if not preview and _raw_out_str:
                    preview = serialize_tool_output(out)
                tool_status: str = "success"
                if isinstance(out, ToolMessage):
                    tool_status = out.status or "success"
                if _raw_out_str and tool_output_indicates_error(_raw_out_str):
                    tool_status = "error"
                run_key = str(run_id) if run_id is not None else None
                start_meta: dict[str, Any] | None = None
                if run_key is not None and run_key in tool_pending_by_run:
                    start_meta = tool_pending_by_run.pop(run_key)
                elif tool_pending_fifo:
                    start_meta = tool_pending_fifo.pop(0)
                tr_name = (start_meta or {}).get("name") or name
                tr_input = (start_meta or {}).get("input") if start_meta else None
                tr: dict[str, Any] = {
                    "type": "tool-result",
                    "name": tr_name,
                    "status": tool_status,
                }
                current_sources = citation_sources_snapshot()
                # 仅下发自上次 tool-result 以来新登记的来源，避免重复 SSE 载荷。
                new_sources = current_sources[last_source_emit_index:]
                if new_sources:
                    tr["sources"] = json_safe_for_sse(new_sources)
                    last_source_emit_index = len(current_sources)
                if run_id is not None:
                    tr["runId"] = run_id
                if preview:
                    tr["outputPreview"] = preview
                if chat_trace:
                    logger.info(
                        "\n%s",
                        format_tool_event_raw(
                            "on_tool_end（原始输出对象，非 SSE 预览）",
                            {
                                "event_name": name,
                                "run_id": run_id,
                                "resolved_name": tr_name,
                                "status": tool_status,
                                "output": serialize_tool_output_for_raw_log(out),
                            },
                        ),
                    )
                if _widget_sse:
                    await flush_thinking_segment()
                    await flush_assistant_segment()
                    persist_payload: dict[str, Any] = {
                        "widgetId": _widget_sse["widgetId"],
                        "widgetType": _widget_sse["widgetType"],
                        "question": _widget_sse["question"],
                    }
                    if _widget_sse.get("widgetType") == "form":
                        persist_payload["fields"] = _widget_sse.get("fields") or []
                    else:
                        persist_payload["choices"] = _widget_sse.get("choices") or []
                        persist_payload["allowFreeText"] = _widget_sse.get(
                            "allowFreeText", True
                        )
                    async with async_session_factory() as session:
                        session.add(
                            MessageRecord(
                                id=_widget_sse["widgetId"] or str(uuid.uuid4()),
                                conversation_id=conv_id,
                                role="widget",
                                content=json.dumps(
                                    persist_payload,
                                    ensure_ascii=False,
                                ),
                            )
                        )
                        await session.commit()
                    yield sse(tr)
                    yield sse(_widget_sse)
                    _break_after_widget = True
                else:
                    yield sse(tr)
                    if new_sources:
                        # 全量 registry 供前端 attach 到本轮所有 assistant 气泡；tool-result.sources 为增量。
                        yield sse(
                            {
                                "type": "source-registry",
                                "sources": json_safe_for_sse(current_sources),
                            }
                        )

                    rec: dict[str, Any] = {"name": tr_name, "outputPreview": preview}
                    rec.update(mcp_tool_sse_metadata(tr_name))
                    if new_sources:
                        rec["sources"] = json_safe_for_sse(new_sources)
                    if tr_input is not None:
                        rec["input"] = tr_input
                    if run_key:
                        rec["runId"] = run_key
                    async with async_session_factory() as session:
                        session.add(
                            MessageRecord(
                                id=str(uuid.uuid4()),
                                conversation_id=conv_id,
                                role="tool",
                                content=json.dumps(rec, ensure_ascii=False),
                            )
                        )
                        await session.commit()

            if _break_after_widget:
                break

        await flush_thinking_segment()
        await flush_assistant_segment()

        if chat_trace:
            logger.info(
                "\n%s",
                format_stream_aggregate_summary(
                    visible="".join(trace_visible_parts),
                    thinking="".join(trace_thinking_parts),
                    stream_response_metadata_merge=trace_stream_rm_merged or None,
                ),
            )

        if title_task and not title_yielded:
            try:
                new_title = await title_task
                yield sse(
                    {"type": "title-updated", "title": new_title, "conversationId": conv_id}
                )
            except Exception:
                fb = truncate(msg_in, 10)
                yield sse(
                    {"type": "title-updated", "title": fb, "conversationId": conv_id}
                )

        stream_completed_normally = True
        yield sse_done()

    except Exception as exc:
        if chat_trace and (trace_visible_parts or trace_thinking_parts):
            logger.info(
                "\n%s\n（说明：本条为流式未正常结束前已收到的部分聚合）",
                format_stream_aggregate_summary(
                    visible="".join(trace_visible_parts),
                    thinking="".join(trace_thinking_parts),
                    stream_response_metadata_merge=trace_stream_rm_merged or None,
                ),
            )
        logger.exception("stream_chat error")
        if title_task and not title_yielded and is_new_conversation and conv_id:
            title_task.cancel()
            yield sse(
                {
                    "type": "title-updated",
                    "title": truncate(msg_in, 10),
                    "conversationId": conv_id,
                }
            )
        safe_err = sanitize_stream_error_message(str(exc))
        if conv_id:
            if flush_thinking_fn is not None:
                try:
                    await flush_thinking_fn()
                except Exception:
                    logger.exception("流式失败时 flush thinking 失败")
            if flush_assistant_fn is not None:
                try:
                    await flush_assistant_fn()
                except Exception:
                    logger.exception("流式失败时 flush assistant 失败")
            try:
                await persist_stream_failure_assistant(
                    conv_id,
                    error_message=safe_err,
                    model_label=meta_chat_model_label(resolved),
                )
            except Exception:
                logger.exception("写入流式错误助手消息失败")
        stream_errored = True
        yield sse({"type": "error", "message": safe_err})
        yield sse_done()
    finally:
        # 客户端 abort 触发 CancelledError（不会被 try/except Exception 捕获），
        # 会直接跳到 finally。这里 shield-flush 残余的思考缓冲与正文缓冲，
        # 避免刷新历史时丢失 abort 当时还没写库的内容。
        # 注意：flush_*_fn 内部各自管理自己的 buf；调用是幂等的（buf 为空时 no-op）。
        if conv_id and flush_thinking_fn is not None:
            try:
                await asyncio.shield(flush_thinking_fn())
            except asyncio.CancelledError:
                pass
            except Exception:
                logger.exception("finally 中 flush thinking 失败")
        if conv_id and flush_assistant_fn is not None:
            try:
                # interim=True：flush_assistant_segment 内部根据 in_summary_phase
                # 自动选 role——summary 前为 thinking 过渡段，summary 后为 assistant 最终答
                await asyncio.shield(flush_assistant_fn(interim=True))
            except asyncio.CancelledError:
                pass
            except Exception:
                logger.exception("finally 中 flush assistant 失败")
        # 中止/异常时仍有 pending 的工具：写一条「已终止」工具记录，
        # 避免刷新历史后该工具气泡消失。使用 shield 防止 SSE 取消打断写库。
        if conv_id and (tool_pending_by_run or tool_pending_fifo):
            pending_snapshot_by_run = dict(tool_pending_by_run)
            pending_snapshot_fifo = list(tool_pending_fifo)
            tool_pending_by_run.clear()
            tool_pending_fifo.clear()
            try:
                await asyncio.shield(
                    _persist_pending_tools_as_aborted(
                        conv_id,
                        pending_snapshot_by_run,
                        pending_snapshot_fifo,
                    )
                )
            except asyncio.CancelledError:
                # 上层取消我们的等待，shield 内部任务仍在事件循环中继续写库
                pass
            except Exception:
                logger.exception("中止后写入工具终止状态失败")
        # 客户端 abort：流既未正常完成、也未走 SSE 错误分支 → 视为用户主动中止。
        # 写一条 role=interrupt-mark 的标记记录，前端历史聚合时把它前面最近一条
        # assistant 消息标记为 interrupted（content 末尾自动追加 "输出已被终止"）。
        if (
            conv_id
            and flush_assistant_fn is not None
            and not stream_completed_normally
            and not stream_errored
        ):
            try:
                await asyncio.shield(_persist_interrupt_mark(conv_id))
            except asyncio.CancelledError:
                pass
            except Exception:
                logger.exception("写入 interrupt-mark 失败")
        if kb_ctx_token is not None:
            chat_agent_kb_id.reset(kb_ctx_token)
        if conv_ctx_token is not None:
            chat_conversation_id.reset(conv_ctx_token)
        chat_user_id.reset(ctx_token)

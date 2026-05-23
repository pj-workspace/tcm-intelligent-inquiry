"""主对话链路的 LLM 往返诊断：完整原始数据的多行格式化（配合 Settings.ai_chat_trace_log）。

环境变量 AI_CHAT_TRACE_LOG=true 时启用。
不对正文、URL、工具入参/出参做截断或摘要；日志可能极大，仅供本机调试。
"""

from __future__ import annotations

import json
from typing import Any

from langchain_core.messages import AIMessage, BaseMessage, ToolMessage

_SEP_W = 80


def trace_banner(title: str = "") -> str:
    """Trace banner (``title``)."""
    t = (title or "").strip()
    if not t:
        return "=" * _SEP_W
    inner = f" {t} "
    max_inner = _SEP_W - 4
    if len(inner) > max_inner:
        inner = inner[: max_inner - 2] + "… "
    pad = _SEP_W - len(inner)
    left = max(2, pad // 2)
    right = _SEP_W - left - len(inner)
    return f"{'=' * left}{inner}{'=' * right}"


def json_pretty_raw(obj: Any) -> str:
    """JSON 格式化；不可序列化字段用 str()，无长度截断。"""
    try:
        return json.dumps(obj, ensure_ascii=False, indent=2, default=str)
    except (TypeError, ValueError):
        return str(obj)


def serialize_lc_message_for_raw_log(msg: BaseMessage) -> dict[str, Any]:
    """LangChain 消息：尽量保留 content 与常见附加字段的原始值（非加工）。"""
    d: dict[str, Any] = {"_lc_class": msg.__class__.__name__}
    d["content"] = getattr(msg, "content", None)
    for k in (
        "id",
        "name",
        "type",
        "tool_calls",
        "invalid_tool_calls",
        "additional_kwargs",
        "response_metadata",
        "usage_metadata",
        "tool_call_id",
        "status",
    ):
        if hasattr(msg, k):
            v = getattr(msg, k)
            if v is not None and v != {} and v != []:
                d[k] = v
    return d


def format_llm_turn_request(
    messages: list[BaseMessage],
    *,
    meta: dict[str, Any],
) -> str:
    """Format llm turn request。"""
    hint = (
        "下列为载入会话 + 本轮用户消息后，送入 LangGraph Agent 的状态中的 messages（原始结构）。\n"
        "系统提示由 create_react_agent 绑定，不包含在本列表。\n"
    )
    chunks = [
        trace_banner("主对话 · 发往 LLM 的上下文 messages（原始）"),
        hint,
        "meta:",
        json_pretty_raw(meta),
        f"messages 条数: {len(messages)}",
        "-" * _SEP_W,
    ]
    for i, m in enumerate(messages):
        chunks.append(f"[{i}]")
        chunks.append(json_pretty_raw(serialize_lc_message_for_raw_log(m)))
        chunks.append("-" * _SEP_W)
    chunks.append(trace_banner())
    return "\n".join(chunks)


def format_tool_event_raw(note: str, payload: dict[str, Any]) -> str:
    """Format tool event raw (``note``, ``payload``)."""
    body = dict(payload)
    body.setdefault("trace_note", note)
    title = note.strip() or "tool"
    return trace_banner(f"主对话 · {title}") + "\n" + json_pretty_raw(body) + "\n" + trace_banner()


def serialize_tool_output_for_raw_log(out: Any) -> Any:
    """工具结束时的 output 对象：尽量完整保留（与前端 outputPreview 无关）。"""
    if isinstance(out, ToolMessage):
        return {
            "_type": "ToolMessage",
            "content": out.content,
            "status": getattr(out, "status", None),
            "tool_call_id": getattr(out, "tool_call_id", None),
            "name": getattr(out, "name", None),
            "additional_kwargs": getattr(out, "additional_kwargs", None) or None,
            "response_metadata": getattr(out, "response_metadata", None) or None,
        }
    if isinstance(out, AIMessage):
        return {
            "_type": "AIMessage",
            "content": out.content,
            "additional_kwargs": getattr(out, "additional_kwargs", None) or None,
            "tool_calls": getattr(out, "tool_calls", None) or None,
        }
    if hasattr(out, "model_dump"):
        try:
            return {"_type": type(out).__name__, "model_dump": out.model_dump()}
        except Exception:
            pass
    if hasattr(out, "content"):
        return {"_type": type(out).__name__, "content": getattr(out, "content")}
    return {"_type": type(out).__name__, "repr": repr(out)}


def format_chat_model_stream_chunk_raw(chunk: Any) -> str:
    """单次 on_chat_model_stream 的 chunk 原始快照。"""
    payload: dict[str, Any] = {"_type": type(chunk).__name__}
    if hasattr(chunk, "model_dump"):
        try:
            payload["model_dump"] = chunk.model_dump(mode="python")
        except Exception:
            payload["model_dump_error"] = "failed; see explicit_attrs / repr_fallback"
            for attr in (
                "content",
                "additional_kwargs",
                "response_metadata",
                "tool_calls",
                "tool_call_chunks",
                "chunk_position",
                "id",
                "name",
                "usage_metadata",
            ):
                if hasattr(chunk, attr):
                    payload[f"attr.{attr}"] = getattr(chunk, attr)
            payload["repr_fallback"] = repr(chunk)
    else:
        if hasattr(chunk, "__dict__"):
            payload["__dict__"] = chunk.__dict__
        else:
            payload["repr"] = repr(chunk)
    return trace_banner("主对话 · on_chat_model_stream chunk（原始）") + "\n" + json_pretty_raw(
        payload
    ) + "\n" + trace_banner()


def format_stream_aggregate_summary(
    *,
    visible: str,
    thinking: str,
    stream_response_metadata_merge: dict[str, Any] | None = None,
) -> str:
    """本轮聚合正文与思考：与原流增量一致，不做截断。

    ``stream_response_metadata_merge``：各 chunk 的 response_metadata 按出现顺序 `.update()`
    合并结果，常用于看到 ``finish_reason`` / ``usage``；末尾空 content 的包体也会写在这里。
    """
    v = visible or ""
    t = thinking or ""
    blocks = [trace_banner("主对话 · 模型流式输出（本轮聚合，未截断）")]
    if stream_response_metadata_merge:
        blocks.append(
            "[说明] 若干 stream chunk 的 content 为空但仍会携带 metadata（例如 finish_reason=stop、"
            "chunk_position=last），属接口常规范式，不是在日志里丢掉了正文。"
        )
        blocks.append("[本轮合并的 response_metadata（按 chunk 顺序 update）]")
        blocks.append(json_pretty_raw(stream_response_metadata_merge))
        blocks.append("-" * _SEP_W)
    if t:
        blocks.append("[thinking / reasoning]")
        blocks.append(t)
        blocks.append("")
    blocks.append("[assistant 正文]")
    blocks.append(v if v else "（本轮无正文增量，或仅有工具调用）")
    blocks.append(trace_banner())
    return "\n".join(blocks)


def format_title_llm_call(*, user_message_excerpt: str, prompt: str, reply_raw: str) -> str:
    """Format title llm call."""
    return "\n".join(
        [
            trace_banner("会话标题生成 · Title LLM（原始全文）"),
            "user_first_message:",
            (user_message_excerpt or "").strip(),
            "-" * _SEP_W,
            "发给标题模型的全文 prompt:",
            (prompt or "").strip(),
            "-" * _SEP_W,
            "标题模型原始返回:",
            (reply_raw or "").strip(),
            trace_banner(),
        ]
    )

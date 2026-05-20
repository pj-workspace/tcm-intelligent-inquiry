"""LangGraph / ChatModel 流式 chunk 解析。"""

from collections.abc import Iterator
from typing import Any

from app.chat.services.streaming.sse import THINKING_MAX, truncate


def extract_text(chunk) -> str:
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


def iter_reasoning_delta_from_chunk(
    chunk: Any, *, truncate_output: bool = True
) -> Iterator[str]:
    """DashScope 等 OpenAI 兼容流：思考在 delta.reasoning_content，LangChain 多放在 additional_kwargs。"""
    kwargs = getattr(chunk, "additional_kwargs", None)
    if isinstance(kwargs, dict):
        for key in ("reasoning_content", "reasoning", "thinking"):
            v = kwargs.get(key)
            if v:
                s = str(v)
                yield truncate(s, THINKING_MAX) if truncate_output else s
                return
    rm = getattr(chunk, "response_metadata", None)
    if isinstance(rm, dict):
        for key in ("reasoning_content", "reasoning"):
            v = rm.get(key)
            if v:
                s = str(v)
                yield truncate(s, THINKING_MAX) if truncate_output else s
                return


def iter_model_stream_parts(
    chunk, *, truncate_output: bool = True
) -> Iterator[tuple[str, str]]:
    """从 chat_model_stream chunk 拆出 (kind, delta)，kind 为 text 或 thinking。"""
    for r in iter_reasoning_delta_from_chunk(chunk, truncate_output=truncate_output):
        yield "thinking", r

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
                    s = str(raw)
                    yield "thinking", (
                        truncate(s, THINKING_MAX) if truncate_output else s
                    )
        elif isinstance(block, str) and block:
            yield "text", block

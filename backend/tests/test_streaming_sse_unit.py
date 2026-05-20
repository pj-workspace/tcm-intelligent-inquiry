"""SSE 格式化与契约单元测试（M0/M1 门禁）。"""

import json

import pytest

from app.chat.services.streaming.sse import (
    json_safe_for_sse,
    sse,
    sse_done,
    truncate,
)

# 与 doc/frontend-integration.md D.3 及前端 useChat 分支对齐
SSE_EVENT_TYPES = frozenset(
    {
        "notice",
        "meta",
        "text-delta",
        "thinking-delta",
        "tool-call",
        "tool-result",
        "widget",
        "title-updated",
        "llm-usage",
        "error",
    }
)


def test_sse_frame_format():
    line = sse({"type": "meta", "conversationId": "c1"})
    assert line.startswith("data: ")
    assert line.endswith("\n\n")
    body = json.loads(line[6:].strip())
    assert body["type"] == "meta"
    assert body["conversationId"] == "c1"


def test_sse_done_line():
    assert sse_done() == "data: [DONE]\n\n"


def test_truncate_ellipsis():
    assert truncate("hello", 10) == "hello"
    long = "x" * 20
    out = truncate(long, 10)
    assert len(out) == 10
    assert out.endswith("…")


def test_json_safe_for_sse_nested():
    safe = json_safe_for_sse({"a": "b" * 9000})
    assert isinstance(safe["a"], str)
    assert len(safe["a"]) <= 8000


@pytest.mark.parametrize(
    "payload",
    [
        {"type": "notice", "safetyNotice": "n"},
        {"type": "meta", "conversationId": "c", "safetyNotice": "s"},
        {"type": "text-delta", "textDelta": "hi"},
        {"type": "thinking-delta", "textDelta": "think"},
        {"type": "tool-call", "name": "t"},
        {"type": "tool-result", "name": "t", "status": "success"},
        {
            "type": "widget",
            "widgetId": "w",
            "question": "q",
            "choices": [],
        },
        {"type": "title-updated", "title": "t", "conversationId": "c"},
        {"type": "llm-usage", "usage": {"total_tokens": 1}},
        {"type": "error", "message": "e"},
    ],
)
def test_known_sse_types_roundtrip(payload: dict):
    assert payload["type"] in SSE_EVENT_TYPES
    line = sse(payload)
    parsed = json.loads(line[6:].strip())
    assert parsed["type"] == payload["type"]


def test_stream_chat_import_path():
    from app.chat.services.streaming import stream_chat

    assert callable(stream_chat)

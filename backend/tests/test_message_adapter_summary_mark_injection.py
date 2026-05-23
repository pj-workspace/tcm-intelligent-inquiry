"""验证历史里的 summary-mark 记录会被 messages_to_lc 注入为
AIMessage(tool_calls) + ToolMessage 对——给模型看到自己上轮调过 mark_summary。
"""

from __future__ import annotations

from langchain_core.messages import AIMessage, ToolMessage

from app.agent.tools._internal.mark_summary import MARK_SUMMARY_TOOL_NAME
from app.chat.services.streaming.message_adapters import (
    _fake_mark_summary_history_pair,
)


def test_fake_pair_returns_aimessage_then_toolmessage():
    """Test fake pair returns aimessage then toolmessage."""
    pair = _fake_mark_summary_history_pair("rec-123")
    assert len(pair) == 2
    ai, tool = pair
    assert isinstance(ai, AIMessage)
    assert isinstance(tool, ToolMessage)


def test_ai_message_carries_mark_summary_tool_call_with_no_args():
    """Test ai message carries mark summary tool call with no args."""
    [ai, _tool] = _fake_mark_summary_history_pair("rec-xyz")
    assert ai.content == ""
    assert isinstance(ai.tool_calls, list) and len(ai.tool_calls) == 1
    call = ai.tool_calls[0]
    assert call["name"] == MARK_SUMMARY_TOOL_NAME
    assert call["args"] == {}
    assert call["id"]  # 非空


def test_tool_message_matches_ai_call_id():
    """Test tool message matches ai call id."""
    [ai, tool] = _fake_mark_summary_history_pair("rec-abc")
    ai_call_id = ai.tool_calls[0]["id"]
    assert tool.tool_call_id == ai_call_id
    assert tool.name == MARK_SUMMARY_TOOL_NAME
    assert tool.content == ""


def test_tool_call_id_is_record_scoped_avoiding_collision():
    """tool_call_id 由 record_id 派生，避免与本轮真实 tool_call 冲突。"""
    a = _fake_mark_summary_history_pair("rec-1")
    b = _fake_mark_summary_history_pair("rec-2")
    assert a[0].tool_calls[0]["id"] != b[0].tool_calls[0]["id"]
    assert "rec-1" in a[0].tool_calls[0]["id"]
    assert "rec-2" in b[0].tool_calls[0]["id"]

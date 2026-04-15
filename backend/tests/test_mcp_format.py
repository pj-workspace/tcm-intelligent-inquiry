"""MCP 客户端结果格式化单元测试（无网络）。"""

import mcp.types as types

from app.mcp.client import _format_call_tool_result


def test_format_call_tool_text():
    r = types.CallToolResult(
        content=[types.TextContent(type="text", text="hello")],
        isError=False,
    )
    assert _format_call_tool_result(r) == "hello"


def test_format_call_tool_error_flag():
    r = types.CallToolResult(
        content=[types.TextContent(type="text", text="bad")],
        isError=True,
    )
    out = _format_call_tool_result(r)
    assert "报错" in out
    assert "bad" in out

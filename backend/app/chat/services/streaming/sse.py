"""SSE 帧格式化与工具 I/O 安全序列化。"""

import json
from typing import Any

from langchain_core.messages import AIMessage, ToolMessage

TOOL_IO_MAX = 8000
THINKING_MAX = 16000


def sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def sse_done() -> str:
    return "data: [DONE]\n\n"


def truncate(s: str, max_len: int) -> str:
    if len(s) <= max_len:
        return s
    return s[: max_len - 1] + "…"


def json_safe_for_sse(obj: Any, max_str: int = TOOL_IO_MAX, depth: int = 0) -> Any:
    """将工具入参等转为可 JSON 序列化结构，并限制深度与字符串长度。"""
    if depth > 12:
        return "…"
    if obj is None or isinstance(obj, (bool, int, float)):
        return obj
    if isinstance(obj, str):
        return truncate(obj, max_str)
    if isinstance(obj, dict):
        out: dict[str, Any] = {}
        for i, (k, v) in enumerate(obj.items()):
            if i >= 40:
                out["…"] = f"共 {len(obj)} 项，已省略"
                break
            out[str(k)[:200]] = json_safe_for_sse(v, max_str, depth + 1)
        return out
    if isinstance(obj, (list, tuple)):
        return [json_safe_for_sse(x, max_str, depth + 1) for x in obj[:40]]
    return truncate(str(obj), max_str)


def tool_output_indicates_error(text: str) -> bool:
    """MCP / 内置工具以字符串返回失败时，供 SSE 标记 status=error。"""
    s = (text or "").strip()
    if not s:
        return False
    prefixes = (
        "工具执行报错",
        "MCP 工具执行失败",
        "MCP 调用失败",
        "MCP stdio 配置缺失",
        "MCP HTTP url 缺失",
    )
    return any(s.startswith(p) for p in prefixes)


def serialize_tool_output(out: Any) -> str:
    """工具结束时的 output 预览（供前端展示，非全量日志）。"""
    if out is None:
        return ""
    if isinstance(out, ToolMessage):
        c = out.content
        if isinstance(c, str):
            return truncate(c, TOOL_IO_MAX)
        if isinstance(c, list):
            parts: list[str] = []
            for b in c:
                if isinstance(b, dict) and b.get("type") == "text":
                    parts.append(str(b.get("text", "")))
                elif isinstance(b, str):
                    parts.append(b)
            return truncate("".join(parts), TOOL_IO_MAX)
        return truncate(json.dumps(c, ensure_ascii=False), TOOL_IO_MAX)
    if isinstance(out, AIMessage):
        return truncate(str(out.content), TOOL_IO_MAX)
    if hasattr(out, "content"):
        return serialize_tool_output(getattr(out, "content"))
    return truncate(str(out), TOOL_IO_MAX)

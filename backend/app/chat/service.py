"""对话服务：将 HTTP 请求转换为 LangGraph 输入，并产出 SSE 事件流。"""

import json
from collections.abc import AsyncIterator

from langchain_core.messages import AIMessage, HumanMessage

from app.core.logging import get_logger

logger = get_logger(__name__)


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _extract_text(chunk) -> str:
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


async def stream_chat(
    message: str,
    history: list,
    agent_id: str | None = None,
) -> AsyncIterator[str]:
    """驱动 LangGraph ReAct Agent，以 SSE 格式流式产出事件。

    事件类型：
      - text-delta: 模型输出文本增量
      - tool-call:  Agent 正在调用工具（含工具名）
      - tool-result: 工具调用完成
      - error:      运行异常
    """
    from app.agent.executor import build_agent_graph

    graph = await build_agent_graph(agent_id)

    messages: list[HumanMessage | AIMessage] = []
    for m in history:
        if m.role == "user":
            messages.append(HumanMessage(content=m.content))
        else:
            messages.append(AIMessage(content=m.content))
    messages.append(HumanMessage(content=message))

    try:
        async for event in graph.astream_events({"messages": messages}, version="v2"):
            etype = event.get("event")

            if etype == "on_chat_model_stream":
                chunk = event.get("data", {}).get("chunk")
                if chunk:
                    delta = _extract_text(chunk)
                    if delta:
                        yield _sse({"type": "text-delta", "textDelta": delta})

            elif etype == "on_tool_start":
                yield _sse({"type": "tool-call", "name": event.get("name", "")})

            elif etype == "on_tool_end":
                yield _sse({"type": "tool-result", "name": event.get("name", "")})

        yield "data: [DONE]\n\n"

    except Exception as exc:
        logger.exception("stream_chat error")
        yield _sse({"type": "error", "message": str(exc)})
        yield "data: [DONE]\n\n"

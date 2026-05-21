"""为 LangChain 工具调用统一注入默认超时。

设计要点：
- 默认 30 秒；超时不抛异常，而是返回友好文案，避免在 ReAct 图中触发未处理错误。
- 复用工具对象（不复制 args_schema / description），通过替换 ``coroutine`` 字段完成包装。
- 幂等：已包装过的工具不重复包装（通过自定义标志位）。
- 仅包装异步工具（``coroutine`` 非空）；纯同步工具留给原有逻辑（本项目中没有）。
"""

from __future__ import annotations

import asyncio
import functools
from collections.abc import Sequence
from typing import Any

from langchain_core.tools import BaseTool

from app.core.logging import get_logger

logger = get_logger(__name__)

#: 工具调用默认超时（秒）。超过该值将返回兜底文案，避免长时间挂死阻塞 Agent。
DEFAULT_TOOL_TIMEOUT_SECONDS: float = 30.0

_WRAPPED_FLAG = "_tcm_timeout_wrapped"


def _build_timeout_message(name: str, timeout: float) -> str:
    secs = int(timeout) if timeout.is_integer() else timeout
    return (
        f"工具「{name}」调用超时（>{secs}s）已自动终止；"
        "请简化参数后重试，或换用其他工具。"
    )


def _wrap_tool_with_timeout(tool: BaseTool, timeout: float) -> BaseTool:
    """就地为单个工具替换 ``coroutine``，添加 asyncio 超时保护。"""
    if getattr(tool, _WRAPPED_FLAG, False):
        return tool
    original = getattr(tool, "coroutine", None)
    if original is None:
        return tool

    @functools.wraps(original)
    async def _bounded(*args: Any, **kwargs: Any) -> Any:
        try:
            return await asyncio.wait_for(
                original(*args, **kwargs),
                timeout=timeout,
            )
        except asyncio.TimeoutError:
            logger.warning(
                "工具调用超时：name=%s timeout=%.1fs", tool.name, timeout
            )
            return _build_timeout_message(tool.name, timeout)

    try:
        tool.coroutine = _bounded  # type: ignore[assignment]
    except Exception:
        # Pydantic v2 BaseModel 在某些子类下禁用赋值；退回到底层 setattr
        object.__setattr__(tool, "coroutine", _bounded)
    object.__setattr__(tool, _WRAPPED_FLAG, True)
    return tool


def apply_default_tool_timeout(
    tools: Sequence[BaseTool],
    timeout_seconds: float = DEFAULT_TOOL_TIMEOUT_SECONDS,
) -> list[BaseTool]:
    """统一为工具列表注入默认超时；返回同一批被就地包装的工具对象。

    传入 list 与底层引用是同一份，repeat 调用是幂等的（已包装的会跳过）。
    """
    if timeout_seconds <= 0:
        return list(tools)
    return [_wrap_tool_with_timeout(t, timeout_seconds) for t in tools]

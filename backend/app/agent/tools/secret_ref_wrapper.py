"""为 LangChain 工具注入 secret:// 引用解析（通用，含全部 MCP）。"""

from __future__ import annotations

import functools
from collections.abc import Sequence
from typing import Any

from langchain_core.tools import BaseTool

from app.chat.secrets import resolve_secret_refs_in_value
from app.core.chat_context import chat_conversation_id
from app.core.logging import get_logger

logger = get_logger(__name__)

_SECRET_WRAPPED_FLAG = "_tcm_secret_ref_wrapped"


def _wrap_tool_with_secret_resolver(tool: BaseTool) -> BaseTool:
    if getattr(tool, _SECRET_WRAPPED_FLAG, False):
        return tool
    original = getattr(tool, "coroutine", None)
    if original is None:
        return tool

    @functools.wraps(original)
    async def _resolved(**kwargs: Any) -> Any:
        cid = chat_conversation_id.get()
        if cid and kwargs:
            try:
                kwargs = await resolve_secret_refs_in_value(kwargs, conversation_id=cid)
            except ValueError as exc:
                logger.warning("secret ref 解析失败 tool=%s: %s", tool.name, exc)
                return f"敏感字段引用无效: {exc!s}"
        return await original(**kwargs)

    try:
        tool.coroutine = _resolved  # type: ignore[assignment]
    except Exception:
        object.__setattr__(tool, "coroutine", _resolved)
    object.__setattr__(tool, _SECRET_WRAPPED_FLAG, True)
    return tool


def apply_secret_ref_resolution(tools: Sequence[BaseTool]) -> list[BaseTool]:
    """为工具列表注入 secret:// 解析；幂等。"""
    return [_wrap_tool_with_secret_resolver(t) for t in tools]

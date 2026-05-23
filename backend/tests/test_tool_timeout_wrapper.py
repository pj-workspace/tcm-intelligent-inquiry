"""默认工具超时包装（30s 兜底）单元测试。"""

from __future__ import annotations

import asyncio

import pytest
from langchain_core.tools import StructuredTool

from app.agent.tools.timeout_wrapper import (
    DEFAULT_TOOL_TIMEOUT_SECONDS,
    apply_default_tool_timeout,
)


def _make_tool(coro):
    """Test make tool."""
    return StructuredTool.from_function(
        name="slow_tool",
        description="测试用慢工具",
        coroutine=coro,
    )


@pytest.mark.asyncio
async def test_tool_completes_within_timeout_returns_original_result():
    """Test tool completes within timeout returns original result."""
    async def fast(x: int = 1) -> str:
        """Test fast."""
        await asyncio.sleep(0.01)
        return f"ok {x}"

    [wrapped] = apply_default_tool_timeout([_make_tool(fast)], timeout_seconds=0.5)
    out = await wrapped.ainvoke({"x": 7})
    assert out == "ok 7"


@pytest.mark.asyncio
async def test_tool_exceeds_timeout_returns_friendly_message_not_exception():
    """Test tool exceeds timeout returns friendly message not exception."""
    async def too_slow(**_: object) -> str:
        """Test too slow."""
        await asyncio.sleep(5.0)
        return "won't get here"

    [wrapped] = apply_default_tool_timeout([_make_tool(too_slow)], timeout_seconds=0.1)
    out = await wrapped.ainvoke({})
    assert "slow_tool" in out
    assert "超时" in out


@pytest.mark.asyncio
async def test_default_timeout_value_is_30s():
    """Test default timeout value is 30s."""
    assert DEFAULT_TOOL_TIMEOUT_SECONDS == 30.0


def test_wrapper_is_idempotent_does_not_double_wrap():
    """Test wrapper is idempotent does not double wrap."""
    async def quick(**_: object) -> str:
        """Test quick."""
        return "ok"

    t = _make_tool(quick)
    once = apply_default_tool_timeout([t], timeout_seconds=0.5)[0]
    twice = apply_default_tool_timeout([once], timeout_seconds=0.5)[0]
    # 第二次返回同一对象，coroutine 也不被再次替换
    assert once is twice
    assert once.coroutine is twice.coroutine


def test_non_async_tool_left_untouched():
    """Test non async tool left untouched."""
    sync_tool = StructuredTool.from_function(
        name="sync_only",
        description="同步工具，不应被包装",
        func=lambda x=1: f"sync {x}",
    )
    [out] = apply_default_tool_timeout([sync_tool])
    assert out is sync_tool
    assert getattr(out, "_tcm_timeout_wrapped", False) is False

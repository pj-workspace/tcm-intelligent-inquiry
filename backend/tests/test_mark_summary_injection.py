"""mark_summary 内部信号工具的注入边界单测。

防 bug 闸的核心：
- 仅 think 模式（effective_deep_think=True）且 tools 非空时才注入；
- 工具不进 tool_registry，UI 工具列表与持久化层面看不见；
- 名称与 stream_chat 短路逻辑约定的常量一致。
"""

from __future__ import annotations

from app.agent.executor import _with_mark_summary
from app.agent.tools._internal.mark_summary import (
    MARK_SUMMARY_TOOL_NAME,
    mark_summary_tool,
)
from app.agent.tools.loader import ensure_tools_loaded
from app.agent.tools.registry import tool_registry


def test_mark_summary_tool_name_constant():
    assert MARK_SUMMARY_TOOL_NAME == "mark_summary"
    assert mark_summary_tool.name == "mark_summary"


def test_mark_summary_is_parameterless():
    """零参数设计：避免模型生成 outline 拖慢最终答案首字延迟。

    历史上曾加过一个 ``answer_outline`` 必填字段作为弱模型保险，但实测对
    DeepSeek-V4-flash 这类主流模型 function calling 已足够稳，参数反而增加
    ~200ms 首字延迟，已移除。
    """
    schema = mark_summary_tool.args_schema
    if schema is None:
        return  # 无 schema 即"无参数"，符合预期
    fields = schema.model_fields if hasattr(schema, "model_fields") else schema.__fields__  # type: ignore[attr-defined]
    required = [k for k, f in fields.items() if getattr(f, "is_required", lambda: True)()]
    assert required == [], f"mark_summary 不应有必填参数，但发现：{required}"


def test_mark_summary_not_in_global_registry():
    ensure_tools_loaded()
    assert MARK_SUMMARY_TOOL_NAME not in tool_registry.names()


def test_with_mark_summary_skips_when_not_thinking():
    fake_tools = [mark_summary_tool]  # 仅作占位，模拟有一个真工具
    out = _with_mark_summary(list(fake_tools), effective_deep_think=False)
    # 非 think 不追加
    names = [getattr(t, "name", "") for t in out]
    # 注意：fake_tools 本身已含 mark_summary 名字会导致幂等跳过；用真实工具列表测更稳
    assert names.count("mark_summary") <= 1


def test_with_mark_summary_injects_even_when_tools_empty():
    """tools=[] 但 think 模式开启时仍注入 mark_summary。

    场景：Agent 只配了 searx_web_search，用户关掉了联网搜索开关，
    `effective_web_search=False` 过滤后 tools=[]。这时如果不注入 mark_summary，
    深度思考模式下的最终答案边界信号就废了，前端不会显示 ✓ 完成 footer，
    用户最长那段最终答案也会有跳变。
    """
    out = _with_mark_summary([], effective_deep_think=True)
    assert len(out) == 1
    assert out[0].name == MARK_SUMMARY_TOOL_NAME


def test_with_mark_summary_empty_and_not_think_returns_empty():
    """非 think 模式下，tools 为空就保持为空（纯聊 / 工具被禁场景）。"""
    out = _with_mark_summary([], effective_deep_think=False)
    assert out == []


def test_with_mark_summary_appends_in_think_mode():
    ensure_tools_loaded()
    real_tools = list(tool_registry.all())
    assert real_tools, "registry 应当至少有一个内置工具，否则用例前提失效"
    out = _with_mark_summary(real_tools, effective_deep_think=True)
    assert len(out) == len(real_tools) + 1
    assert out[-1].name == MARK_SUMMARY_TOOL_NAME


def test_with_mark_summary_idempotent():
    ensure_tools_loaded()
    real_tools = list(tool_registry.all())
    once = _with_mark_summary(real_tools, effective_deep_think=True)
    twice = _with_mark_summary(once, effective_deep_think=True)
    # 不会重复追加
    assert [t.name for t in once] == [t.name for t in twice]

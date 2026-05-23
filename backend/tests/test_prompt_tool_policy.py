"""提示词与工具描述的关键协议测试。

这些测试不评估模型质量本身，而是防止后续修改把工具触发协议、
ask_user 暂停规则或 mark_summary 边界规则从 prompt/tool docstring 中删掉。
"""

from app.agent.prompts import DEEP_THINK_SUFFIX, RAW_DEFAULT_SYSTEM_PROMPT
from app.agent.tools._internal.mark_summary import mark_summary_tool
from app.agent.tools.ask_user.plugin import ask_user
from app.agent.tools.formula_lookup.plugin import formula_lookup, recommend_formulas
from app.agent.tools.tcm_search.plugin import search_tcm_knowledge


def _description(tool) -> str:
    return str(getattr(tool, "description", "") or "")


def test_default_prompt_uses_structured_tool_policy():
    assert "<tool_decision_order>" in RAW_DEFAULT_SYSTEM_PROMPT
    assert "<tool_policy>" in RAW_DEFAULT_SYSTEM_PROMPT
    assert "<examples>" in RAW_DEFAULT_SYSTEM_PROMPT


def test_default_prompt_maps_core_tools_to_use_cases():
    prompt = RAW_DEFAULT_SYSTEM_PROMPT
    assert "经典依据" in prompt and "search_tcm_knowledge" in prompt
    assert "明确给出方剂名" in prompt and "formula_lookup" in prompt
    assert "症状" in prompt and "recommend_formulas" in prompt
    assert "缺失信息会导致" in prompt and "ask_user" in prompt


def test_deep_think_protocol_requires_mark_summary_before_final_answer():
    assert "<deep_think_protocol>" in DEEP_THINK_SUFFIX
    assert "最终答案" in DEEP_THINK_SUFFIX
    assert "mark_summary" in DEEP_THINK_SUFFIX
    assert "ask_user" in DEEP_THINK_SUFFIX


def test_ask_user_description_contains_pause_contract():
    desc = _description(ask_user)
    assert "暂停当前回答" in desc
    assert "单独调用" in desc
    assert "停止输出" in desc
    assert "不要在 ask_user 之后继续猜测" in desc


def test_mark_summary_description_contains_boundary_contract():
    desc = _description(mark_summary_tool)
    assert "Call exactly once" in desc
    assert "immediately before the final answer" in desc
    assert "Do not use it" in desc
    assert "ask_user" in desc


def test_business_tool_descriptions_reduce_selection_ambiguity():
    assert "经典依据" in _description(search_tcm_knowledge)
    assert "明确方剂名称" in _description(formula_lookup)
    assert "症状" in _description(recommend_formulas)
    assert "应先 ask_user" in _description(recommend_formulas)

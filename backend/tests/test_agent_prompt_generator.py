"""Agent system prompt AI 生成：单元测试与 live 集成测试。"""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.agent.prompt_generator import (
    _normalize_suggested_tools,
    _parse_llm_payload,
    _validate_xml_system_prompt,
    generate_agent_system_prompt,
)
from app.agent.schemas import BuiltinToolInfo
from app.core.exceptions import ValidationError

_SAMPLE_XML = """\
<role>
你是方剂检索助手。
</role>

<answer_style>
- 先结论后展开。
</answer_style>

<tool_decision_order>
1. 明确方名则 formula_lookup。
</tool_decision_order>

<tool_policy>
<formula_lookup>
用户给出方剂名时调用。
</formula_lookup>
</tool_policy>

<examples>
<example>
用户：桂枝汤组成？
期望：formula_lookup 后回答。
</example>
</examples>"""

_SAMPLE_JSON = json.dumps(
    {
        "system_prompt": _SAMPLE_XML,
        "suggested_tool_names": ["formula_lookup"],
        "reasoning": "需要查方",
    },
    ensure_ascii=False,
)


def test_validate_xml_system_prompt_ok():
    _validate_xml_system_prompt(_SAMPLE_XML)


def test_validate_xml_system_prompt_rejects_placeholder():
    with pytest.raises(ValidationError, match="占位符"):
        _validate_xml_system_prompt("<role><待填：x></role>")


def test_validate_xml_system_prompt_rejects_missing_tag():
    partial = (
        "<role>x</role><answer_style>x</answer_style>"
        "<tool_decision_order>x</tool_decision_order><examples>x</examples>"
    )
    with pytest.raises(ValidationError, match="tool_policy"):
        _validate_xml_system_prompt(partial)


def test_normalize_suggested_tools():
    available = {"formula_lookup", "search_tcm_knowledge", "ask_user"}
    out = _normalize_suggested_tools(
        ["formula_lookup", "bad", "formula_lookup", "search_tcm_knowledge"],
        available,
    )
    assert out == ["formula_lookup", "search_tcm_knowledge"]


def test_parse_llm_payload():
    payload = _parse_llm_payload(_SAMPLE_JSON)
    assert "formula_lookup" in payload.suggested_tool_names
    assert "<role>" in payload.system_prompt


@pytest.mark.asyncio
async def test_generate_agent_system_prompt_mocked():
    tools = [
        BuiltinToolInfo(
            name="formula_lookup",
            label="方剂查询",
            description="按方名查组成",
            category="formula",
            source="builtin",
            args_schema=[],
            used_by_agents=0,
        ),
    ]
    fake_msg = MagicMock()
    fake_msg.content = _SAMPLE_JSON

    with patch(
        "app.llm.chat_factory.build_chat_model",
        return_value=MagicMock(ainvoke=AsyncMock(return_value=fake_msg)),
    ):
        prompt, suggested, reasoning = await generate_agent_system_prompt(
            name="方剂助手",
            description="帮用户查经典方",
            tools=tools,
            available_tool_names={"formula_lookup"},
        )
    assert "<tool_policy>" in prompt
    assert suggested == ["formula_lookup"]
    assert reasoning == "需要查方"


@pytest.mark.integration
def test_generate_system_prompt_api_mocked(client, auth_headers):
    """API 路由与鉴权（LLM mock）。"""
    fake_xml = _SAMPLE_XML
    fake_json = json.dumps(
        {
            "system_prompt": fake_xml,
            "suggested_tool_names": ["formula_lookup"],
            "reasoning": "ok",
        },
        ensure_ascii=False,
    )
    fake_msg = MagicMock()
    fake_msg.content = fake_json

    with patch(
        "app.llm.chat_factory.build_chat_model",
        return_value=MagicMock(ainvoke=AsyncMock(return_value=fake_msg)),
    ):
        r = client.post(
            "/api/agents/generate-system-prompt",
            json={
                "name": "方剂助手",
                "description": "检索经典方剂",
            },
            headers=auth_headers,
        )
    assert r.status_code == 200
    body = r.json()
    assert "<role>" in body["system_prompt"]
    assert "formula_lookup" in body["suggested_tool_names"]


@pytest.mark.integration
@pytest.mark.live_llm
def test_generate_system_prompt_api_live(client, auth_headers):
    """真实 LLM 调用（需配置 API Key；默认 skip）。"""
    r = client.post(
        "/api/agents/generate-system-prompt",
        json={
            "name": "中医文献研究员",
            "description": "帮用户检索中医经典文献并解释条文含义",
            "user_requirements": "语气严谨，偏学术研究",
        },
        headers=auth_headers,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["system_prompt"]) >= 80
    assert "<role>" in body["system_prompt"].lower()
    assert "<tool_policy>" in body["system_prompt"].lower()
    assert isinstance(body["suggested_tool_names"], list)
    assert len(body["suggested_tool_names"]) >= 1

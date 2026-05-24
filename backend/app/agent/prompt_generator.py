"""根据 Agent 名称/说明与工具目录，AI 生成 XML 风格 system prompt 并推荐工具。"""

from __future__ import annotations

import asyncio
from typing import Iterable

from pydantic import BaseModel, Field, ValidationError as PydanticValidationError

from app.agent.prompts import RAW_DEFAULT_SYSTEM_PROMPT
from app.agent.schemas import BuiltinToolInfo
from app.chat.suggestions.follow_up import _extract_ai_text, _loads_json_object
from app.core.exceptions import ValidationError
from app.core.logging import get_logger

logger = get_logger(__name__)

_JSON_OBJECT_PROVIDERS = frozenset({"qwen", "openai", "glm", "deepseek"})
_REQUIRED_XML_TAGS = ("role", "answer_style", "tool_decision_order", "tool_policy", "examples")
_MAX_PROMPT_CHARS = 12_000
_MAX_SUGGESTED_TOOLS = 20
_GENERATE_TIMEOUT_SEC = 45.0


class _LlmPayload(BaseModel):
    system_prompt: str = Field(min_length=80, max_length=_MAX_PROMPT_CHARS)
    suggested_tool_names: list[str] = Field(default_factory=list, max_length=_MAX_SUGGESTED_TOOLS)
    reasoning: str | None = Field(default=None, max_length=800)


def _format_tool_catalog(tools: Iterable[BuiltinToolInfo]) -> str:
    lines: list[str] = []
    for t in tools:
        parts = [
            f"- name: {t.name}",
            f"  label: {t.label}",
            f"  category: {t.category}",
            f"  source: {t.source or 'builtin'}",
        ]
        if t.mcp_server:
            parts.append(f"  mcp_server: {t.mcp_server}")
        desc = (t.description or "").strip()
        if desc:
            parts.append(f"  description: {desc[:400]}")
        lines.append("\n".join(parts))
    return "\n\n".join(lines) if lines else "（当前无可用工具）"


def _validate_xml_system_prompt(text: str) -> None:
    s = (text or "").strip()
    if not s:
        raise ValidationError("生成的 system_prompt 为空")
    if "<待填" in s or "待填：" in s:
        raise ValidationError("生成的提示词仍含占位符，请重试")
    lower = s.lower()
    for tag in _REQUIRED_XML_TAGS:
        if f"<{tag}>" not in lower and f"<{tag} " not in lower:
            raise ValidationError(f"生成的提示词缺少必需 XML 块 <{tag}>")
    if "```" in s:
        raise ValidationError("生成的提示词不应包含 Markdown 代码围栏")


def _normalize_suggested_tools(
    raw: list[str] | None,
    available: set[str],
) -> list[str]:
    if not raw:
        return []
    out: list[str] = []
    seen: set[str] = set()
    for item in raw:
        name = (item or "").strip()
        if not name or name not in available or name in seen:
            continue
        seen.add(name)
        out.append(name)
        if len(out) >= _MAX_SUGGESTED_TOOLS:
            break
    return out


def _parse_llm_payload(raw: str) -> _LlmPayload:
    data = _loads_json_object(raw)
    if data is None or not isinstance(data, dict):
        raise ValidationError("模型未返回合法 JSON，请重试")
    try:
        return _LlmPayload.model_validate(data)
    except PydanticValidationError as exc:
        raise ValidationError(f"JSON 结构不符合要求：{exc}") from exc


def _build_meta_prompt(
    *,
    name: str,
    description: str,
    tool_catalog: str,
    default_kb_name: str | None,
    user_requirements: str | None,
) -> str:
    kb_line = default_kb_name or "未指定"
    extra = (user_requirements or "").strip()
    extra_block = f"\n【用户补充需求】\n{extra}\n" if extra else ""

    return (
        "你是 Agent 配置助手，负责为中医药智能问答产品生成自定义 Agent 的 system prompt，"
        "并推荐应绑定的工具名。\n\n"
        "【输出格式】\n"
        "只输出一条合法 JSON（不要 Markdown 围栏、不要前后解释）。JSON Schema 示例：\n"
        '{"system_prompt":"...","suggested_tool_names":["search_tcm_knowledge"],'
        '"reasoning":"一句话说明工具选择理由"}\n\n'
        "【system_prompt 格式要求 — 必须严格 XML】\n"
        "1. system_prompt 必须是 XML 风格纯文本，顶层块与顺序参考下列结构样例。\n"
        "2. 必须包含且仅使用这些顶层块：<role>、<answer_style>、<tool_decision_order>、"
        "<tool_policy>、<examples>；若会用到知识库/联网/方剂检索，还需 <citation_policy>。\n"
        "3. <tool_policy> 内：每个 suggested_tool_names 中的工具各写一个子标签；"
        "子标签名必须与工具 name 完全一致（如 <search_tcm_knowledge>、<formula_lookup>、"
        "<mcp_xxx_yyy>）。\n"
        "4. 写明何时调用何工具；涉及处方/用药须提示不能替代面诊；不要留 <待填> 占位符。\n"
        "5. <examples> 内放 2～3 个 <example>，贴近本 Agent 场景。\n\n"
        "【结构样例（仅供格式参考，内容需按本次 Agent 重写）】\n"
        f"<<<\n{RAW_DEFAULT_SYSTEM_PROMPT}\n>>>\n\n"
        "【Agent 名称】\n"
        f"{name.strip()}\n\n"
        "【Agent 说明】\n"
        f"{(description or '').strip() or '（无）'}\n\n"
        f"【默认知识库】\n{kb_line}\n"
        f"{extra_block}\n"
        "【可用工具目录（suggested_tool_names 只能从中选取 name）】\n"
        f"{tool_catalog}\n\n"
        "请根据名称与说明选择最相关的工具（不必全选）；"
        "system_prompt 中的工具策略与 suggested_tool_names 保持一致。"
    )


async def generate_agent_system_prompt(
    *,
    name: str,
    description: str,
    tools: list[BuiltinToolInfo],
    default_kb_name: str | None = None,
    user_requirements: str | None = None,
    available_tool_names: set[str] | None = None,
) -> tuple[str, list[str], str | None]:
    """调用 LLM 生成 XML system prompt 与推荐工具名。"""
    from app.core.config import get_settings
    from app.llm.chat_factory import build_chat_model

    agent_name = (name or "").strip()
    if not agent_name:
        raise ValidationError("Agent 名称不能为空")

    catalog = list(tools)
    available = available_tool_names or {t.name for t in catalog}
    if not catalog:
        raise ValidationError("当前无可用工具，无法生成")

    s = get_settings()
    provider = (s.llm_provider or "qwen").strip().lower()
    use_json = provider in _JSON_OBJECT_PROVIDERS

    model_override: str | None = None
    if provider == "qwen":
        model_override = (s.qwen_follow_up_suggestions_model or "").strip() or "qwen-flash"

    model = build_chat_model(
        enable_thinking=False,
        chat_model_override=model_override,
        response_format_json_object=use_json,
    )

    prompt = _build_meta_prompt(
        name=agent_name,
        description=description,
        tool_catalog=_format_tool_catalog(catalog),
        default_kb_name=default_kb_name,
        user_requirements=user_requirements,
    )

    try:
        res = await asyncio.wait_for(
            model.ainvoke(prompt),
            timeout=_GENERATE_TIMEOUT_SEC,
        )
    except asyncio.TimeoutError as exc:
        raise ValidationError("生成超时，请稍后重试") from exc
    except Exception as exc:
        logger.warning("Agent system prompt generation failed: %s", exc)
        raise ValidationError(f"生成失败：{exc!s}") from exc

    raw = _extract_ai_text(res).strip()
    if not raw:
        raise ValidationError("模型返回为空，请重试")

    payload = _parse_llm_payload(raw)
    _validate_xml_system_prompt(payload.system_prompt)
    suggested = _normalize_suggested_tools(payload.suggested_tool_names, available)
    if not suggested:
        raise ValidationError("模型未推荐任何有效工具，请重试或补充 Agent 说明")

    reasoning = (payload.reasoning or "").strip() or None
    logger.info(
        "Agent prompt generated name=%s tools=%s len=%s",
        agent_name,
        suggested,
        len(payload.system_prompt),
    )
    return payload.system_prompt.strip(), suggested, reasoning

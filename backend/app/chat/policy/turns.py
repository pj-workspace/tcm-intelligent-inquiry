"""解析本轮请求的 effective 对话模型与各能力裁剪后的布尔值。"""

from __future__ import annotations

from dataclasses import dataclass

from app.chat.catalog import normalize_requested_llm_provider
from app.core.config import (
    get_settings,
    list_qwen_chat_model_option_rows,
    primary_qwen_chat_model,
    qwen_option_for_model_id,
)


@dataclass(frozen=True)
class ResolvedChatTurn:
    """传给 stream_chat / 构图用。"""

    effective_llm_provider: str
    llm_chat_model_id: str
    effective_deep_think: bool
    effective_web_search: bool
    effective_tool_calling: bool


def _canonical_single_model(*, provider: str, chat_model_body: str | None, s) -> str:
    """openai / glm / anthropic：仅允许环境变量中的单一模型 id。"""
    p = provider.strip().lower()
    if p == "openai":
        canonical = (s.openai_chat_model or "").strip()
    elif p == "glm":
        canonical = (s.glm_chat_model or "").strip()
    elif p == "anthropic":
        canonical = (s.anthropic_chat_model or "").strip()
    else:
        raise AssertionError(provider)
    if not canonical:
        raise ValueError(f"{p}: 请配置对应 *_CHAT_MODEL")
    cand = (chat_model_body or "").strip() or canonical
    if cand != canonical:
        raise ValueError(f"{p} 当前仅支持配置的模型 id: {canonical!r}（收到 {cand!r}）")
    return cand


def resolve_chat_turn(
    *,
    llm_provider_body: str | None,
    chat_model_body: str | None,
    deep_think: bool,
    web_search_enabled: bool,
) -> ResolvedChatTurn:
    """Resolve chat turn。"""
    s = get_settings()
    override = normalize_requested_llm_provider(llm_provider_body, settings=s)
    eff_lp = override if override is not None else (s.llm_provider or "qwen").strip().lower()

    if eff_lp == "deepseek":
        from app.core.deepseek_chat_options import (
            deepseek_option_for_model_id,
            primary_deepseek_chat_model_id,
        )

        pid = primary_deepseek_chat_model_id(settings=s)
        cand = (chat_model_body or "").strip() or pid
        row = deepseek_option_for_model_id(cand)
        if row is None:
            raise ValueError(f"无效的 chat_model: {cand!r}")

        tc = row.supports_tool_calling
        td = row.supports_deep_think
        effective_deep_think = deep_think and td
        effective_tool_calling = tc
        effective_web_search = web_search_enabled and tc

        return ResolvedChatTurn(
            effective_llm_provider=eff_lp,
            llm_chat_model_id=cand,
            effective_deep_think=effective_deep_think,
            effective_web_search=effective_web_search,
            effective_tool_calling=effective_tool_calling,
        )

    if eff_lp == "qwen":
        opts = list_qwen_chat_model_option_rows(s)
        pid = primary_qwen_chat_model(s)
        if not opts:
            mid = (s.qwen_chat_model or "").strip()
            return ResolvedChatTurn(
                effective_llm_provider=eff_lp,
                llm_chat_model_id=mid,
                effective_deep_think=deep_think,
                effective_web_search=web_search_enabled,
                effective_tool_calling=True,
            )

        cand = (chat_model_body or "").strip() or pid
        row = qwen_option_for_model_id(cand, settings=s)
        if row is None:
            raise ValueError(f"无效的 chat_model: {cand!r}")

        tc = row.supports_tool_calling
        td = row.supports_deep_think
        return ResolvedChatTurn(
            effective_llm_provider=eff_lp,
            llm_chat_model_id=cand,
            effective_deep_think=deep_think and td,
            effective_web_search=web_search_enabled and tc,
            effective_tool_calling=tc,
        )

    if eff_lp == "openai":
        mid = _canonical_single_model(provider="openai", chat_model_body=chat_model_body, s=s)
        return ResolvedChatTurn(
            effective_llm_provider=eff_lp,
            llm_chat_model_id=mid,
            effective_deep_think=deep_think,
            effective_web_search=web_search_enabled,
            effective_tool_calling=True,
        )

    if eff_lp == "glm":
        mid = _canonical_single_model(provider="glm", chat_model_body=chat_model_body, s=s)
        return ResolvedChatTurn(
            effective_llm_provider=eff_lp,
            llm_chat_model_id=mid,
            effective_deep_think=deep_think,
            effective_web_search=web_search_enabled,
            effective_tool_calling=True,
        )

    if eff_lp == "anthropic":
        mid = _canonical_single_model(provider="anthropic", chat_model_body=chat_model_body, s=s)
        return ResolvedChatTurn(
            effective_llm_provider=eff_lp,
            llm_chat_model_id=mid,
            effective_deep_think=deep_think,
            effective_web_search=web_search_enabled,
            effective_tool_calling=True,
        )

    raise ValueError(f"不支持的 llm_provider: {eff_lp!r}")

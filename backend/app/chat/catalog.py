"""对话模型目录：聚合各厂商可选模型（含未配置 Key 的占位），供前端分组展示。"""

from __future__ import annotations

from typing import Any

from app.chat.model_display import (
    context_window_hint,
    infer_speed_tag,
    short_model_list_label,
)
from app.core.config import Settings, get_settings, list_qwen_chat_model_option_rows
from app.core.deepseek_chat_options import list_deepseek_chat_model_option_rows
from app.core.qwen_chat_options import QwenChatModelOptionRow

_LLPM_IDS = frozenset({"qwen", "deepseek", "openai", "anthropic", "glm"})


def catalog_provider_ids() -> frozenset[str]:
    """与前端目录一致的厂商 id 集合（用于路由白名单等）。"""
    return _LLPM_IDS


def provider_has_credentials(s: Settings, provider_id: str) -> bool:
    """Provider has credentials (``s``, ``provider_id``)."""
    pid = (provider_id or "").strip().lower()
    if pid == "qwen":
        return bool((s.dashscope_api_key or "").strip())
    if pid == "deepseek":
        return bool((s.deepseek_api_key or "").strip())
    if pid == "openai":
        return bool((s.openai_api_key or "").strip())
    if pid == "anthropic":
        return bool((s.anthropic_api_key or "").strip())
    if pid == "glm":
        return bool((s.zhipu_api_key or "").strip())
    return False


def normalize_requested_llm_provider(
    llm_provider_body: str | None,
    *,
    settings: Settings | None = None,
) -> str | None:
    """请求体显式传入厂商 id 时校验并返回小写 id；未传则返回 None（由调用方回退到 Settings.llm_provider）。"""
    raw = (llm_provider_body or "").strip().lower()
    if not raw:
        return None
    if raw not in _LLPM_IDS:
        raise ValueError(f"不支持的 llm_provider: {raw!r}，可选: {', '.join(sorted(_LLPM_IDS))}")
    s = settings or get_settings()
    if not provider_has_credentials(s, raw):
        raise ValueError(f"厂商「{raw}」未配置可用的 API Key，无法用于对话")
    return raw


def _capability_blurb_zh(cap: dict[str, Any]) -> str:
    """Internal helper: capability blurb zh."""
    parts: list[str] = []
    inp = cap.get("input")
    if isinstance(inp, list) and "image" in inp:
        parts.append("支持附图（多模态）")
    else:
        parts.append("纯文本（不支持本地上传图片作为模态输入）")
    if cap.get("supports_tool_calling") is False:
        parts.append("不支持工具调用（本轮将关闭 Agent 工具与联网检索）")
    else:
        parts.append("支持工具调用与联网检索（若开启）")
    if cap.get("supports_deep_think") is False:
        parts.append("不支持模型侧深度思考通道")
    else:
        parts.append("可选用深度思考（若厂商与模型支持）")
    return "；".join(parts) + "。"


def _qwen_model_description(row: QwenChatModelOptionRow) -> str:
    """Internal helper: qwen model description."""
    base = (
        "DashScope OpenAI 兼容对话。"
        "附图快捷话术、追问建议等能力与 llm_provider=qwen 时的独立配置相关。"
    )
    return f"{_capability_blurb_zh(row.api_capabilities)}{base}"


def _openai_infer_capabilities(model_id: str) -> dict[str, Any]:
    """Internal helper: openai infer capabilities."""
    m = (model_id or "").lower()
    has_image = (
        "gpt-4o" in m
        or "vision" in m
        or "omni" in m
        or m.startswith("gpt-4-turbo")
    )
    return {
        "input": ["text", "image"] if has_image else ["text"],
        "supports_tool_calling": True,
        "supports_deep_think": True,
    }


def _glm_infer_capabilities(_model_id: str) -> dict[str, Any]:
    """Internal helper: glm infer capabilities."""
    return {
        "input": ["text"],
        "supports_tool_calling": True,
        "supports_deep_think": True,
    }


def _anthropic_infer_capabilities(_model_id: str) -> dict[str, Any]:
    """Internal helper: anthropic infer capabilities."""
    return {
        "input": ["text"],
        "supports_tool_calling": True,
        "supports_deep_think": True,
    }


_DEEPSEEK_MODEL_BLURB = {
    "deepseek-v4-flash": "V4 高性价比档位，适合日常问询与工具调用。",
    "deepseek-v4-pro": "V4 更强推理档位，适合复杂辨证与长链路推理。",
}

_DEEPSEEK_CARD_TITLE = {
    "deepseek-v4-flash": "DeepSeek V4 Flash",
    "deepseek-v4-pro": "DeepSeek V4 Pro",
}


def _catalog_model_dict(
    provider_id: str,
    *,
    model_id: str,
    source_label: str,
    default: bool,
    capabilities: dict[str, Any],
    description: str,
) -> dict[str, Any]:
    """Internal helper: _catalog_model_dict."""
    sl = (source_label or "").strip() or model_id
    return {
        "id": model_id,
        "label": short_model_list_label(provider_id, sl, model_id),
        "full_label": sl,
        "provider_id": provider_id,
        "default": default,
        "capabilities": capabilities,
        "description": description,
        "speed_tag": infer_speed_tag(provider_id, model_id),
        "context_window_hint": context_window_hint(provider_id, model_id),
    }


def build_chat_model_catalog(*, settings: Settings | None = None) -> dict[str, Any]:
    """返回前端分组结构：固定顺序列出全部厂商；models 至少一项。"""
    s = settings or get_settings()
    default_lp = (s.llm_provider or "qwen").strip().lower()

    providers_out: list[dict[str, Any]] = []

    # ── qwen ──────────────────────────────────────────────────────────────
    q_rows = list_qwen_chat_model_option_rows(s)
    q_models: list[dict[str, Any]]
    if q_rows:
        q_models = []
        for r in q_rows:
            q_models.append(
                _catalog_model_dict(
                    "qwen",
                    model_id=r.id,
                    source_label=r.label,
                    default=r.default,
                    capabilities=r.api_capabilities,
                    description=_qwen_model_description(r),
                )
            )
    else:
        mid = (s.qwen_chat_model or "").strip() or "qwen-plus"
        cap: dict[str, Any] = {
            "input": ["text"],
            "supports_tool_calling": True,
            "supports_deep_think": True,
            "supports_vision": False,
        }
        q_models = [
            _catalog_model_dict(
                "qwen",
                model_id=mid,
                source_label=mid,
                default=True,
                capabilities=cap,
                description=(
                    "未配置 QWEN_CHAT_MODEL_OPTIONS 时的单一主模型。"
                    + _capability_blurb_zh(cap)
                    + "可在 .env 配置 OPTIONS 以启用多模型下拉。"
                ),
            )
        ]
    providers_out.append(
        {
            "id": "qwen",
            "label": "阿里云 DashScope（通义千问）",
            "description": "与知识库向量嵌入、重排序共用 DashScope Key；兼容 OpenAI Chat Completions。",
            "configured": provider_has_credentials(s, "qwen"),
            "models": q_models,
        }
    )

    # ── deepseek ──────────────────────────────────────────────────────────
    d_models: list[dict[str, Any]] = []
    for r in list_deepseek_chat_model_option_rows():
        blurb = _DEEPSEEK_MODEL_BLURB.get(r.id, "DeepSeek V4 系列模型（OpenAI 兼容）。")
        d_models.append(
            _catalog_model_dict(
                "deepseek",
                model_id=r.id,
                source_label=_DEEPSEEK_CARD_TITLE.get(r.id, r.label),
                default=r.default,
                capabilities=r.api_capabilities,
                description=blurb + _capability_blurb_zh(r.api_capabilities),
            )
        )
    providers_out.append(
        {
            "id": "deepseek",
            "label": "DeepSeek",
            "description": (
                "OpenAI 兼容接口；V4 支持工具调用与 Thinking。"
                "深度思考与检索可同时开启；含工具的多轮对话需由客户端完整回传 reasoning_content（本应用已处理）。"
            ),
            "configured": provider_has_credentials(s, "deepseek"),
            "models": d_models,
        }
    )

    # ── openai ────────────────────────────────────────────────────────────
    o_mid = (s.openai_chat_model or "").strip() or "gpt-4o-mini"
    o_cap = _openai_infer_capabilities(o_mid)
    providers_out.append(
        {
            "id": "openai",
            "label": "OpenAI",
            "description": "官方 API 或兼容网关；模型能力取决于 OPENAI_CHAT_MODEL。",
            "configured": provider_has_credentials(s, "openai"),
            "models": [
                _catalog_model_dict(
                    "openai",
                    model_id=o_mid,
                    source_label=o_mid,
                    default=True,
                    capabilities=o_cap,
                    description="当前环境配置的 OpenAI 对话模型。"
                    + _capability_blurb_zh(o_cap),
                )
            ],
        }
    )

    # ── anthropic ─────────────────────────────────────────────────────────
    a_mid = (s.anthropic_chat_model or "").strip() or "claude-3-5-sonnet-20241022"
    a_cap = _anthropic_infer_capabilities(a_mid)
    providers_out.append(
        {
            "id": "anthropic",
            "label": "Anthropic Claude",
            "description": "Messages API；深度思考开启时使用 Extended Thinking（temperature=1）。",
            "configured": provider_has_credentials(s, "anthropic"),
            "models": [
                _catalog_model_dict(
                    "anthropic",
                    model_id=a_mid,
                    source_label=a_mid,
                    default=True,
                    capabilities=a_cap,
                    description="当前环境配置的 Claude 模型。"
                    + _capability_blurb_zh(a_cap),
                )
            ],
        }
    )

    # ── glm ────────────────────────────────────────────────────────────────
    g_mid = (s.glm_chat_model or "").strip() or "glm-4"
    g_cap = _glm_infer_capabilities(g_mid)
    providers_out.append(
        {
            "id": "glm",
            "label": "智谱 GLM",
            "description": "智谱 OpenAI 兼容 REST（bigmodel.cn）。",
            "configured": provider_has_credentials(s, "glm"),
            "models": [
                _catalog_model_dict(
                    "glm",
                    model_id=g_mid,
                    source_label=g_mid,
                    default=True,
                    capabilities=g_cap,
                    description="当前环境配置的 GLM 模型。"
                    + _capability_blurb_zh(g_cap),
                )
            ],
        }
    )

    return {
        "default_llm_provider": default_lp if default_lp in _LLPM_IDS else "qwen",
        "providers": providers_out,
    }

"""按配置组装对话模型（多厂商）。"""

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_openai import ChatOpenAI

from app.core.config import get_settings


def build_chat_model(
    enable_thinking: bool = False,
    chat_model_override: str | None = None,
    *,
    llm_provider: str | None = None,
    response_format_json_object: bool = False,
) -> BaseChatModel:
    """Build a LangChain chat model for the configured or overridden provider.

    Args:
        enable_thinking: Enable extended/deep thinking when supported.
        chat_model_override: Explicit model id; provider-specific validation applies.
        llm_provider: Override ``Settings.llm_provider`` for this call.
        response_format_json_object: Request JSON-object response format when supported.

    Returns:
        Configured ``BaseChatModel`` instance.

    Raises:
        ValueError: Unknown provider or missing API credentials.
    """
    s = get_settings()
    raw_lp = llm_provider if isinstance(llm_provider, str) and llm_provider.strip() else None
    p = (raw_lp.strip().lower() if raw_lp else (s.llm_provider or "qwen")).strip().lower()

    if p == "qwen":
        from app.llm.providers.qwen import build_qwen_chat

        return build_qwen_chat(
            enable_thinking=enable_thinking,
            chat_model_override=chat_model_override,
            response_format_json_object=response_format_json_object,
        )

    if p == "openai":
        key = (s.openai_api_key or "").strip()
        if not key:
            raise ValueError("llm_provider=openai 时请配置 OPENAI_API_KEY")
        base = (s.openai_base_url or "").strip() or "https://api.openai.com/v1"
        kw: dict = {
            "model": s.openai_chat_model,
            "api_key": key,
            "base_url": base.rstrip("/"),
            "temperature": 0.2,
        }
        if response_format_json_object:
            kw["model_kwargs"] = {"response_format": {"type": "json_object"}}
        return ChatOpenAI(**kw)

    if p == "anthropic":
        from langchain_anthropic import ChatAnthropic

        key = (s.anthropic_api_key or "").strip()
        if not key:
            raise ValueError("llm_provider=anthropic 时请配置 ANTHROPIC_API_KEY")
        if enable_thinking:
            # Claude extended thinking 要求 temperature=1，budget_tokens 建议 ≥ 1024
            return ChatAnthropic(
                model=s.anthropic_chat_model,
                api_key=key,
                temperature=1,
                thinking={"type": "enabled", "budget_tokens": 8000},
            )
        return ChatAnthropic(
            model=s.anthropic_chat_model,
            api_key=key,
            temperature=0.2,
        )

    if p == "glm":
        key = (s.zhipu_api_key or "").strip()
        if not key:
            raise ValueError("llm_provider=glm 时请配置 ZHIPU_API_KEY（智谱 AI）")
        base = (s.glm_base_url or "").strip() or "https://open.bigmodel.cn/api/paas/v4"
        kw: dict = {
            "model": s.glm_chat_model,
            "api_key": key,
            "base_url": base.rstrip("/"),
            "temperature": 0.2,
        }
        if response_format_json_object:
            kw["model_kwargs"] = {"response_format": {"type": "json_object"}}
        return ChatOpenAI(**kw)

    if p == "deepseek":
        from app.llm.providers.deepseek import build_deepseek_chat

        return build_deepseek_chat(
            enable_thinking=enable_thinking,
            chat_model_override=chat_model_override,
            response_format_json_object=response_format_json_object,
        )

    raise ValueError(
        f"不支持的 llm_provider: {p!r}，可选: qwen, openai, anthropic, glm, deepseek"
    )

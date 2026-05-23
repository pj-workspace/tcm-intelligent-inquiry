"""DeepSeek（OpenAI 兼容 Chat Completions）对话提供者。

V4：同一模型 id 下通过 extra_body.thinking + reasoning_effort 控制思考模式，
见 https://api-docs.deepseek.com/guides/thinking_mode

含工具调用时，必须在后续请求中原样回传 assistant 的 reasoning_content，
否则 API 返回 400。LangChain 默认的 _convert_message_to_dict 不会带上该字段，
故在请求组装阶段注入。
"""

from __future__ import annotations

from typing import Any

from langchain_core.language_models import LanguageModelInput
from langchain_core.messages import AIMessage, AIMessageChunk
from langchain_core.outputs import ChatGenerationChunk
from langchain_openai.chat_models._compat import _convert_from_v1_to_chat_completions
from langchain_openai.chat_models.base import ChatOpenAI, _convert_message_to_dict

from app.core.config import get_settings
from app.core.deepseek_chat_options import primary_deepseek_chat_model_id


def _delta_as_dict(delta: Any) -> dict[str, Any] | None:
    """Internal helper: delta as dict."""
    if delta is None:
        return None
    if isinstance(delta, dict):
        return delta
    if hasattr(delta, "model_dump"):
        return delta.model_dump()
    return None


class DeepSeekChatOpenAI(ChatOpenAI):
    """补齐流式 reasoning_content，并在发请求时写回 reasoning_content（工具+思考必备）。"""

    def _get_request_payload(
        self,
        input_: LanguageModelInput,
        *,
        stop: list[str] | None = None,
        **kwargs: Any,
    ) -> dict[str, Any]:
        """Internal helper: _get_request_payload."""
        messages = self._convert_input(input_).to_messages()
        if stop is not None:
            kwargs["stop"] = stop

        payload = {**self._default_params, **kwargs}

        if self._use_responses_api(payload):
            return super()._get_request_payload(input_, stop=stop, **kwargs)

        out_messages: list[dict[str, Any]] = []
        for m in messages:
            if isinstance(m, AIMessage):
                converted = _convert_from_v1_to_chat_completions(m)
                d = _convert_message_to_dict(converted)
                rc = m.additional_kwargs.get("reasoning_content")
                has_tools = bool(d.get("tool_calls"))
                if has_tools:
                    # 含工具调用的 assistant 消息必须在后续请求中带 reasoning_content（可为空）
                    d["reasoning_content"] = str(rc) if rc is not None else ""
                elif rc is not None and str(rc) != "":
                    d["reasoning_content"] = str(rc)
            else:
                d = _convert_message_to_dict(m)
            out_messages.append(d)

        payload["messages"] = out_messages
        return payload

    def _convert_chunk_to_generation_chunk(
        self,
        chunk: dict[str, Any],
        default_chunk_class: type,
        base_generation_info: dict | None,
    ) -> ChatGenerationChunk | None:
        """Internal helper: _convert_chunk_to_generation_chunk."""
        gen = super()._convert_chunk_to_generation_chunk(
            chunk, default_chunk_class, base_generation_info
        )
        if gen is None:
            return gen
        msg = gen.message
        if not isinstance(msg, AIMessageChunk):
            return gen
        choices = chunk.get("choices") or []
        if not choices:
            return gen
        delta = _delta_as_dict(choices[0].get("delta"))
        if not delta:
            return gen
        rc = (
            delta.get("reasoning_content")
            or delta.get("reasoning")
            or delta.get("thinking")
        )
        if rc is not None and str(rc) != "":
            msg.additional_kwargs["reasoning_content"] = str(rc)
        return gen


def build_deepseek_chat(
    enable_thinking: bool = False,
    chat_model_override: str | None = None,
    *,
    response_format_json_object: bool = False,
) -> ChatOpenAI:
    """Build deepseek chat。"""
    s = get_settings()
    key = (s.deepseek_api_key or "").strip()
    if not key:
        raise ValueError("llm_provider=deepseek 时请配置 DEEPSEEK_API_KEY")
    base = (s.deepseek_base_url or "").strip() or "https://api.deepseek.com/v1"

    mid = (chat_model_override or "").strip() or primary_deepseek_chat_model_id(
        settings=s
    )

    kwargs: dict[str, Any] = {
        "model": mid,
        "api_key": key,
        "base_url": base.rstrip("/"),
        "temperature": 0.2,
        # V4：显式关闭思考，避免服务端默认 enabled 与预期不一致
        "extra_body": {"thinking": {"type": "disabled"}},
    }
    if enable_thinking:
        kwargs["extra_body"] = {"thinking": {"type": "enabled"}}
        kwargs["reasoning_effort"] = "high"

    if response_format_json_object:
        kwargs.setdefault("model_kwargs", {})["response_format"] = {
            "type": "json_object",
        }

    kwargs["stream_usage"] = True

    return DeepSeekChatOpenAI(**kwargs)

"""通义千问（DashScope）LLM 与 Embedding 提供者。

对话模型使用 OpenAI 兼容接口，向量模型使用 DashScope 原生 SDK。
"""

from typing import Any

from langchain_community.embeddings import DashScopeEmbeddings
from langchain_core.messages import AIMessageChunk
from langchain_core.outputs import ChatGenerationChunk
from langchain_openai import ChatOpenAI

from app.core.config import get_settings, primary_qwen_chat_model

# 嵌入模型按「Key + 模型名」指纹缓存，避免每次检索新建客户端；配置变更后自动换新实例
_emb_fp: str | None = None
_emb_singleton: DashScopeEmbeddings | None = None


def _delta_as_dict(delta: Any) -> dict[str, Any] | None:
    """Internal helper: delta as dict."""
    if delta is None:
        return None
    if isinstance(delta, dict):
        return delta
    if hasattr(delta, "model_dump"):
        return delta.model_dump()
    return None


class DashScopeChatOpenAI(ChatOpenAI):
    """在标准 ChatOpenAI 上补齐 DashScope 流式 reasoning_content。

    langchain-openai 的 `_convert_delta_to_message_chunk` 不读取 `delta.reasoning_content`，
    导致 enable_thinking 时思考内容被丢弃；此处从原始 chunk 写回 `additional_kwargs`。
    """

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


def build_qwen_chat(
    enable_thinking: bool = False,
    chat_model_override: str | None = None,
    *,
    response_format_json_object: bool = False,
) -> ChatOpenAI:
    """Build qwen chat。"""
    s = get_settings()
    key = (s.dashscope_api_key or "").strip()
    if not key:
        raise ValueError("llm_provider=qwen 时请配置 DASHSCOPE_API_KEY")
    model_name = (
        (chat_model_override or "").strip() or primary_qwen_chat_model(s)
    )
    kwargs: dict = {
        "model": model_name,
        "api_key": key,
        "base_url": s.dashscope_base_url,
        "temperature": 0.2,
    }
    # enable_thinking 由调用方显式传入（按钮 or 全局缺省）；不在此处读取 s.qwen_enable_thinking，
    # 避免全局开关覆盖按钮关闭的情况。
    if enable_thinking:
        kwargs["extra_body"] = {"enable_thinking": True}
    if response_format_json_object:
        # DashScope 要求 messages 中须出现单词 json/json（见官方 structured output 文档）
        kwargs.setdefault("model_kwargs", {})["response_format"] = {"type": "json_object"}
    return DashScopeChatOpenAI(**kwargs)


def get_embeddings() -> DashScopeEmbeddings:
    """Get embeddings."""
    global _emb_fp, _emb_singleton
    s = get_settings()
    key = (s.dashscope_api_key or "").strip()
    if not key:
        raise ValueError("知识库向量嵌入需要 DASHSCOPE_API_KEY（DashScope 嵌入模型）")
    fp = f"{key}|{s.qwen_embedding_model}"
    if _emb_singleton is not None and fp == _emb_fp:
        return _emb_singleton
    _emb_singleton = DashScopeEmbeddings(
        model=s.qwen_embedding_model,
        dashscope_api_key=key,
    )
    _emb_fp = fp
    return _emb_singleton

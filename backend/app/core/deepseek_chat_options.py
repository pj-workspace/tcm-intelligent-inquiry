"""DeepSeek 对话模型内置清单（V4 flash / pro）；与 Qwen OPTIONS 形状对齐供前端下拉。"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.core.config import Settings, get_settings


@dataclass(frozen=True)
class DeepSeekChatModelOptionRow:
    """Deep Seek Chat Model Option Row."""
    id: str
    label: str
    default: bool
    supports_tool_calling: bool
    supports_deep_think: bool
    supports_vision: bool
    api_capabilities: dict[str, Any]


def _built_in_rows() -> tuple[DeepSeekChatModelOptionRow, ...]:
    """官方模型 id：见 DeepSeek API V4 发布公告。"""
    return (
        DeepSeekChatModelOptionRow(
            id="deepseek-v4-flash",
            label="Flash",
            default=True,
            supports_tool_calling=True,
            supports_deep_think=True,
            supports_vision=False,
            api_capabilities={
                "input": ["text"],
                "supports_tool_calling": True,
                "supports_deep_think": True,
                "supports_vision": False,
            },
        ),
        DeepSeekChatModelOptionRow(
            id="deepseek-v4-pro",
            label="Pro",
            default=False,
            supports_tool_calling=True,
            supports_deep_think=True,
            supports_vision=False,
            api_capabilities={
                "input": ["text"],
                "supports_tool_calling": True,
                "supports_deep_think": True,
                "supports_vision": False,
            },
        ),
    )


def list_deepseek_chat_model_option_rows() -> list[DeepSeekChatModelOptionRow]:
    """List deepseek chat model option rows."""
    return list(_built_in_rows())


def deepseek_option_for_model_id(model_id: str) -> DeepSeekChatModelOptionRow | None:
    """Deepseek option for model id (``model_id``)."""
    mid = (model_id or "").strip()
    if not mid:
        return None
    for row in _built_in_rows():
        if row.id == mid:
            return row
    return None


def primary_deepseek_chat_model_id(*, settings: Settings | None = None) -> str:
    """环境变量中的默认模型；不在白名单时回退 deepseek-v4-flash。"""
    s = settings or get_settings()
    mid = (s.deepseek_chat_model or "").strip()
    if deepseek_option_for_model_id(mid):
        return mid
    return "deepseek-v4-flash"

"""QWEN_CHAT_MODEL_OPTIONS JSON 解析与校验（单源模型白名单）。"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, Field, field_validator


class QwenCapabilitiesModel(BaseModel):
    """capabilities 字段；省略键时使用与计划一致的默认值。"""

    model_config = {"extra": "allow"}

    input: list[str] = Field(default_factory=lambda: ["text"])
    supports_tool_calling: bool = True
    supports_deep_think: bool = True

    @field_validator("input", mode="before")
    @classmethod
    def _coerce_input(cls, v: Any) -> Any:
        """Internal helper: coerce input."""
        if v is None:
            return ["text"]
        return v


class QwenChatModelOptionModel(BaseModel):
    """Qwen Chat Model Option Model data model."""
    id: str
    label: str
    default: bool = False
    capabilities: QwenCapabilitiesModel = Field(default_factory=QwenCapabilitiesModel)


@dataclass(frozen=True)
class QwenChatModelOptionRow:
    """Qwen Chat Model Option Row."""
    id: str
    label: str
    default: bool
    input: tuple[str, ...]
    supports_tool_calling: bool
    supports_deep_think: bool
    api_capabilities: dict[str, Any]


def parse_qwen_chat_model_options(raw: str) -> list[QwenChatModelOptionRow]:
    """解析单行 JSON；非法结构抛 ValueError（Settings 校验用）。"""
    s = (raw or "").strip()
    if not s:
        return []
    try:
        data = json.loads(s)
    except json.JSONDecodeError as e:
        raise ValueError(f"QWEN_CHAT_MODEL_OPTIONS 非法 JSON：{e}") from e
    if not isinstance(data, list):
        raise ValueError("QWEN_CHAT_MODEL_OPTIONS 须为 JSON 数组")
    if len(data) == 0:
        return []
    parsed: list[QwenChatModelOptionModel] = []
    for i, item in enumerate(data):
        if not isinstance(item, dict):
            raise ValueError(f"QWEN_CHAT_MODEL_OPTIONS[{i}] 须为对象")
        try:
            parsed.append(QwenChatModelOptionModel.model_validate(item))
        except Exception as e:
            raise ValueError(f"QWEN_CHAT_MODEL_OPTIONS[{i}] 校验失败：{e}") from e
    ids = [m.id.strip() for m in parsed]
    if any(not x for x in ids):
        raise ValueError("QWEN_CHAT_MODEL_OPTIONS 每项 id 不得为空")
    if len(set(ids)) != len(ids):
        raise ValueError("QWEN_CHAT_MODEL_OPTIONS id 不得重复")

    defaults = [m for m in parsed if m.default is True]
    if len(defaults) != 1:
        raise ValueError("QWEN_CHAT_MODEL_OPTIONS 须恰好有一项 default:true")

    out: list[QwenChatModelOptionRow] = []
    for m in parsed:
        cap = m.capabilities
        tpl = tuple(cap.input or ("text",))
        api_cap = cap.model_dump(mode="json")
        out.append(
            QwenChatModelOptionRow(
                id=m.id.strip(),
                label=m.label.strip() or m.id.strip(),
                default=m.default,
                input=tpl,
                supports_tool_calling=bool(cap.supports_tool_calling),
                supports_deep_think=bool(cap.supports_deep_think),
                api_capabilities=api_cap,
            )
        )
    return out

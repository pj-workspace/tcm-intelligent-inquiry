"""ask_user_form：向前端发送表单，收集敏感/结构化字段（15 分钟 secret:// 引用）。"""

from __future__ import annotations

import json
import uuid
from typing import Literal

from langchain_core.tools import tool
from pydantic import BaseModel, Field

from app.agent.tools.registry import tool_registry


class AskUserFormField(BaseModel):
    """单个表单字段定义。"""

    name: str = Field(..., description="字段名，英文/数字/下划线，如 email、password")
    label: str = Field(..., description="展示标签，如「QQ 邮箱」")
    type: Literal["text", "password", "email", "number"] = Field(
        default="text",
        description="输入类型；密码请用 password",
    )
    required: bool = Field(default=True, description="是否必填")
    placeholder: str = Field(default="", description="占位提示")


@tool_registry.register
@tool
def ask_user_form(
    question: str,
    fields: list[AskUserFormField],
) -> str:
    """向用户展示表单以收集敏感或结构化信息（如账号、密码、API Key）。

    使用时机：
    - 调用 MCP 工具前缺少凭证/参数，且不应让用户在聊天框明文输入。
    - 需要多个字段一次性收集（比 ask_user 选择题更适合账号密码）。

    规则：
    - 单独调用，不要与其他工具并发。
    - 调用后只输出一句极短提示（如「请填写上方表单」），然后停止。
    - 用户提交后，在后续 MCP 工具参数中使用 secret://{widget_id}/{字段名} 引用；
      例如 password 参数填 secret://w-abc123/password，系统会自动解密注入。

    参数：
    - question: 表单标题/说明（简洁）
    - fields: 1～8 个字段；敏感项 type 用 password
    """
    widget_id = f"w-{uuid.uuid4().hex[:10]}"
    norm_fields: list[dict[str, object]] = []
    for f in (fields or [])[:8]:
        name = (f.name or "").strip()
        label = (f.label or "").strip()
        if not name or not label:
            continue
        norm_fields.append(
            {
                "name": name[:64],
                "label": label[:80],
                "type": f.type if f.type in ("text", "password", "email", "number") else "text",
                "required": bool(f.required),
                "placeholder": (f.placeholder or "").strip()[:120],
            }
        )
    if not norm_fields:
        return json.dumps({"error": "至少需要一个有效字段"}, ensure_ascii=False)

    payload = {
        "__widget__": True,
        "widgetId": widget_id,
        "widgetType": "form",
        "question": (question or "").strip()[:120],
        "fields": norm_fields,
    }
    return json.dumps(payload, ensure_ascii=False)

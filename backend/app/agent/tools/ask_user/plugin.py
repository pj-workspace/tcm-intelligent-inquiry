"""ask_user：向前端发送交互选择框，暂停等待用户作答。

调用本工具后，前端会在对话流中插入一张可交互的选择卡片，
用户点选或填写后，其回答将作为下一条用户消息继续对话。
"""

from __future__ import annotations

import json
import uuid

from langchain_core.tools import tool

from app.agent.tools.registry import tool_registry


@tool_registry.register
@tool
def ask_user(
    question: str,
    choices: list[str],
    allow_free_text: bool = True,
) -> str:
    """向用户发送一个交互选择框，暂停当前回答并等待用户补充关键信息。

    使用时机：
    - 用户的症状/证型描述不足，且缺失信息会改变辨证方向、方剂方向、安全判断或下一步建议。
    - 需要用户在几个明确方向中选择，例如疼痛性质、寒热偏向、伴随症状、时间长短、舌脉线索、是否孕产/儿童/老人等。
    - 不调用就只能猜测，而猜测会明显降低答案可靠性。

    不要使用时机：
    - 信息虽不完整，但可以给出通用科普、风险提醒或明确说明"需进一步辨证"。
    - 用户已经给出足够信息回答当前问题。
    - 只是为了收集更多背景，而不是解决关键决策分歧。

    调用规则：
    - 本工具应单独调用，不要与其他工具并发。
    - 调用后请只输出一句极短提示（如"请从上方选择"），然后停止输出，等待用户作答。
    - 不要在 ask_user 之后继续猜测、继续调用其他工具或给出完整答案。

    参数：
    - question: 向用户展示的问题（简洁，30字以内）
    - choices: 选项列表，2 至 6 个，每项不超过 20 字
    - allow_free_text: 是否允许用户自由填写（默认 True）
    """
    widget_id = f"w-{uuid.uuid4().hex[:10]}"
    payload = {
        "__widget__": True,
        "widgetId": widget_id,
        "widgetType": "choice",
        "question": (question or "").strip()[:60],
        "choices": [str(c).strip()[:30] for c in (choices or [])[:6] if str(c).strip()],
        "allowFreeText": bool(allow_free_text),
    }
    return json.dumps(payload, ensure_ascii=False)

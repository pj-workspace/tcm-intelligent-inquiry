"""根据待发送图片（URL）用 VL 模型生成 2～3 条附图快捷话术（label + 完整 prompt）。

独立于主对话 SSE；仅用 qwen + DASHSCOPE_API_KEY + 专用 VL 模型 id（默认 qwen3-vl-flash）。
"""

from __future__ import annotations

import asyncio

from langchain_core.messages import HumanMessage

from app.chat.images.vl_sanitize import (
    ensure_urls_probed,
    filter_image_urls_by_probe_cache,
)
from app.chat.suggestions.follow_up import _extract_ai_text, _loads_json_object
from app.core.logging import get_logger

logger = get_logger(__name__)

_MAX_ITEMS = 3
_LABEL_MAX = 16
_PROMPT_MAX = 560
_JSON_OBJECT_PROVIDERS = frozenset({"qwen"})


def _truncate(s: str, n: int) -> str:
    """Internal helper: truncate."""
    t = (s or "").strip().replace("\n", " ")
    if len(t) <= n:
        return t
    return t[: n - 1] + "…"


def _normalize_items(obj: object) -> list[dict[str, str]]:
    """Internal helper: normalize items."""
    raw_list: list[object] | None = None
    if isinstance(obj, list):
        raw_list = obj
    elif isinstance(obj, dict):
        raw_list = obj.get("suggestions") or obj.get("items")
    if not isinstance(raw_list, list):
        return []

    out: list[dict[str, str]] = []
    for row in raw_list:
        if not isinstance(row, dict):
            continue
        lab = row.get("label") or row.get("title")
        pr = row.get("prompt") or row.get("text") or row.get("content")
        if lab is None or pr is None:
            continue
        label = _truncate(str(lab), _LABEL_MAX)
        prompt = _truncate(str(pr), _PROMPT_MAX)
        if not label or not prompt:
            continue
        out.append({"label": label, "prompt": prompt})
        if len(out) >= _MAX_ITEMS:
            break
    return out


def _parse_payload(raw: str) -> list[dict[str, str]]:
    """Internal helper: parse payload."""
    data = _loads_json_object(raw)
    if data is None:
        return []
    if isinstance(data, str):
        return []
    return _normalize_items(data)


async def generate_attachment_suggestions(
    image_urls: list[str],
    *,
    timeout_sec: float = 28.0,
) -> list[dict[str, str]]:
    """Generate attachment suggestions。"""
    from app.core.config import get_settings
    from app.llm.chat_factory import build_chat_model

    s = get_settings()
    p = (s.llm_provider or "qwen").strip().lower()
    if p == "deepseek":
        logger.info("attachment suggestions skipped: llm_provider=%s (no vision)", p)
        return []
    if p not in _JSON_OBJECT_PROVIDERS:
        logger.info("attachment suggestions skipped: llm_provider=%s", p)
        return []

    raw = [u.strip() for u in image_urls if isinstance(u, str) and u.strip()]
    if not raw:
        return []

    vl_ok: dict[str, bool] = {}
    await ensure_urls_probed(list(dict.fromkeys(raw)), ok_cache=vl_ok)
    urls = filter_image_urls_by_probe_cache(raw, vl_ok)
    if not urls:
        return []

    model_name = (s.qwen_vl_attachment_suggestions_model or "").strip() or "qwen3-vl-flash"
    model = build_chat_model(
        enable_thinking=False,
        chat_model_override=model_name,
        response_format_json_object=True,
    )

    instruct = (
        "你是一款中医药智能问答产品的助手。用户正在输入区**待发送**图片，尚未写正文。\n"
        "请**查看**图片内容，生成恰好 2～3 条可供一键发送的快捷话术。\n\n"
        "每条必须是 JSON 对象：\n"
        f'• "label"：按钮短标题，口语化，**不超过 {_LABEL_MAX} 个字符**（含标点）。\n'
        f'• "prompt"：用户点击后发送给助手的**完整**一句或一小段话，须结合图中可见信息，'
        "中医学习与**科普**向，说明不能替代执业医师面诊；辨认不确定时明确说勿臆断。\n\n"
        "**只输出一条合法 JSON**，关键字中须出现 json。不要 Markdown 围栏、不要解释。\n"
        'Schema：{"suggestions":[{"label":"…","prompt":"…"}, …]}\n\n'
        "若图与中医不明显相关，仍给出 2～3 条泛化的、安全的科普向建议，不要返回空数组。"
    )

    blocks: list[dict] = [{"type": "text", "text": instruct}]
    for u in urls:
        blocks.append({"type": "image_url", "image_url": {"url": u}})
    msg = HumanMessage(content=blocks)

    async def _call() -> list[dict[str, str]]:
        """Internal helper: call."""
        res = await model.ainvoke([msg])
        raw_text = _extract_ai_text(res) if res is not None else ""
        return _parse_payload(raw_text.strip())

    try:
        items = await asyncio.wait_for(_call(), timeout=timeout_sec)
        return items[:_MAX_ITEMS] if items else []
    except TimeoutError:
        logger.warning("attachment suggestions timed out")
        return []
    except Exception as e:
        logger.warning("attachment suggestions failed: %s", e)
        return []

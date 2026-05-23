"""多模态送入 VL 前校验远程图片：拉取 URL + Pillow 尺寸，与 OSS 上传校验一致，避免 400 InvalidParameter。"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Sequence

import httpx
from langchain_core.messages import AIMessage, HumanMessage

from app.core.config import get_settings
from app.storage.aliyun.chat_image import assert_image_meets_vl_size_limits

logger = logging.getLogger(__name__)


def _extract_url_from_image_block(block: dict) -> str:
    """Internal helper: extract url from image block."""
    iu = block.get("image_url")
    if isinstance(iu, dict):
        return str(iu.get("url") or "").strip()
    if isinstance(iu, str):
        return iu.strip()
    return ""


def collect_unique_image_urls_from_messages(
    messages: Sequence[HumanMessage | AIMessage],
) -> list[str]:
    """Collect unique image urls from messages。"""
    seen: set[str] = set()
    out: list[str] = []
    for m in messages:
        if not isinstance(m, HumanMessage):
            continue
        c = m.content
        if not isinstance(c, list):
            continue
        for block in c:
            if not isinstance(block, dict) or block.get("type") != "image_url":
                continue
            u = _extract_url_from_image_block(block)
            if u and u not in seen:
                seen.add(u)
                out.append(u)
    return out


async def _fetch_url_bytes_capped(url: str, max_bytes: int) -> bytes:
    """Internal helper: fetch url bytes capped."""
    timeout = httpx.Timeout(30.0, connect=10.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        async with client.stream("GET", url) as response:
            response.raise_for_status()
            buf = bytearray()
            async for chunk in response.aiter_bytes(chunk_size=65536):
                if not chunk:
                    continue
                buf.extend(chunk)
                if len(buf) > max_bytes:
                    raise ValueError("响应超过聊天图片大小上限")
            return bytes(buf)


async def probe_url_image_ok_for_vl(url: str, *, max_bytes: int) -> bool:
    """Probe url image ok for vl (``url``)."""
    try:
        data = await _fetch_url_bytes_capped(url, max_bytes)
        if not data:
            return False
        assert_image_meets_vl_size_limits(data)
        return True
    except Exception as exc:
        logger.info(
            "VL 图片 URL 不可用或不合规，已忽略: %s… — %s",
            (url[:96] + "…") if len(url) > 96 else url,
            exc,
        )
        return False


async def ensure_urls_probed(
    urls: list[str],
    *,
    ok_cache: dict[str, bool],
) -> None:
    """对尚未在 cache 中的 URL 并发探测，结果写入 ok_cache[u] = True/False。"""
    max_b = int(get_settings().oss_chat_image_max_bytes)
    todo = [u for u in urls if isinstance(u, str) and u.strip() and u not in ok_cache]
    if not todo:
        return

    async def _probe(u: str) -> tuple[str, bool]:
        """Internal helper: probe."""
        return u, await probe_url_image_ok_for_vl(u, max_bytes=max_b)

    pairs = await asyncio.gather(*[_probe(u) for u in todo])
    for u, ok in pairs:
        ok_cache[u] = ok


def filter_image_urls_by_probe_cache(
    urls: list[str],
    ok_cache: dict[str, bool],
) -> list[str]:
    """Filter image urls by probe cache。"""
    return [u for u in urls if isinstance(u, str) and u.strip() and ok_cache.get(u, False)]


def sanitize_human_message_for_vl(msg: HumanMessage, ok_cache: dict[str, bool]) -> HumanMessage:
    """Sanitize human message for vl (``msg``, ``ok_cache``)."""
    c = msg.content
    if not isinstance(c, list):
        return msg

    new_blocks: list[dict | str] = []
    had_any_image = False
    kept_any_image = False

    for block in c:
        if isinstance(block, dict):
            if block.get("type") != "image_url":
                new_blocks.append(block)
                continue
            had_any_image = True
            url = _extract_url_from_image_block(block)
            if url and ok_cache.get(url, False):
                new_blocks.append(block)
                kept_any_image = True
            continue
        new_blocks.append(block)

    if not had_any_image:
        return msg

    has_text = any(
        isinstance(b, dict) and b.get("type") == "text" and str(b.get("text", "")).strip()
        for b in new_blocks
    )
    if kept_any_image:
        return HumanMessage(content=new_blocks)

    # 曾含图但全部被过滤
    note = "（附图因尺寸不合模型要求已省略，请重新上传清晰大图。）"
    if has_text:
        return HumanMessage(content=new_blocks)
    return HumanMessage(content=[{"type": "text", "text": note}])


def sanitize_messages_for_vl_images(
    messages: list[HumanMessage | AIMessage],
    ok_cache: dict[str, bool],
) -> list[HumanMessage | AIMessage]:
    """Sanitize messages for vl images。"""
    out: list[HumanMessage | AIMessage] = []
    for m in messages:
        if isinstance(m, HumanMessage):
            out.append(sanitize_human_message_for_vl(m, ok_cache))
        else:
            out.append(m)
    return out


# 无视觉（文本）模型：送入 API 前移除 image_url，避免 DeepSeek 等非多模态报错
TEXT_ONLY_MODEL_IMAGE_OMITTED_NOTE = "（当前对话模型不支持图像，附图已从上下文省略。）"


def strip_human_message_image_blocks_for_text_only(msg: HumanMessage) -> HumanMessage:
    """移除 image_url 块；若曾含图则在正文末追加说明。"""
    c = msg.content
    if not isinstance(c, list):
        return msg

    had_image = False
    new_blocks: list[dict | str] = []
    for block in c:
        if isinstance(block, dict) and block.get("type") == "image_url":
            had_image = True
            continue
        new_blocks.append(block)

    if not had_image:
        return msg

    has_text = any(
        isinstance(b, dict) and b.get("type") == "text" and str(b.get("text", "")).strip()
        for b in new_blocks
    )
    note = TEXT_ONLY_MODEL_IMAGE_OMITTED_NOTE
    if has_text:
        for i, b in enumerate(new_blocks):
            if isinstance(b, dict) and b.get("type") == "text":
                t = str(b.get("text", ""))
                sep = "\n" if t.strip() else ""
                new_blocks[i] = {"type": "text", "text": f"{t.rstrip()}{sep}{note}"}
                break
        return HumanMessage(content=new_blocks)
    return HumanMessage(content=[{"type": "text", "text": note}])


def sanitize_messages_for_text_only_images(
    messages: list[HumanMessage | AIMessage],
) -> list[HumanMessage | AIMessage]:
    """Sanitize messages for text only images。"""
    out: list[HumanMessage | AIMessage] = []
    for m in messages:
        if isinstance(m, HumanMessage):
            out.append(strip_human_message_image_blocks_for_text_only(m))
        else:
            out.append(m)
    return out

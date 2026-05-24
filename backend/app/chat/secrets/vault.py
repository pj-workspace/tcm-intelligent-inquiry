"""会话级敏感字段保险库：Fernet 加密 + Redis/内存，15 分钟 TTL。"""

from __future__ import annotations

import base64
import hashlib
import json
import re
import time
from typing import Any

from cryptography.fernet import Fernet, InvalidToken

from app.chat.secrets.constants import SECRET_REF_PREFIX, SECRET_VAULT_TTL_SECONDS
from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_REF_PATTERN = re.compile(
    r"^secret://([a-zA-Z0-9_-]{4,64})/([a-zA-Z0-9_.-]{1,64})$"
)

# 进程内回退：{redis_key: (expires_at_monotonic, ciphertext)}
_memory_store: dict[str, tuple[float, str]] = {}


def _fernet() -> Fernet:
    raw = (get_settings().jwt_secret or "dev-insecure").encode()
    key = base64.urlsafe_b64encode(hashlib.sha256(raw).digest())
    return Fernet(key)


def _redis_key(conversation_id: str, widget_id: str, field_name: str) -> str:
    return f"chat:secret:{conversation_id}:{widget_id}:{field_name}"


def _purge_memory_expired() -> None:
    now = time.monotonic()
    dead = [k for k, (exp, _) in _memory_store.items() if exp <= now]
    for k in dead:
        _memory_store.pop(k, None)


async def store_form_secrets(
    *,
    conversation_id: str,
    widget_id: str,
    fields: dict[str, str],
) -> list[str]:
    """加密保存表单字段，返回可用字段名列表。"""
    cid = (conversation_id or "").strip()
    wid = (widget_id or "").strip()
    if not cid or not wid:
        raise ValueError("conversation_id 与 widget_id 不能为空")
    if not fields:
        raise ValueError("表单字段不能为空")

    f = _fernet()
    stored: list[str] = []
    use_redis = True
    r = None
    try:
        from app.core.redis_client import get_redis

        r = get_redis()
        await r.ping()
    except Exception:
        use_redis = False

    for name, value in fields.items():
        key_name = (name or "").strip()
        if not key_name or not re.fullmatch(r"[a-zA-Z0-9_.-]{1,64}", key_name):
            continue
        plain = str(value)
        token = f.encrypt(plain.encode("utf-8")).decode("ascii")
        rk = _redis_key(cid, wid, key_name)
        if use_redis and r is not None:
            await r.setex(rk, SECRET_VAULT_TTL_SECONDS, token)
        else:
            _purge_memory_expired()
            _memory_store[rk] = (
                time.monotonic() + SECRET_VAULT_TTL_SECONDS,
                token,
            )
        stored.append(key_name)

    if not stored:
        raise ValueError("无有效表单字段可保存")
    logger.info(
        "Vault 已保存表单 secrets conv=%s widget=%s fields=%s ttl=%ss",
        cid,
        wid,
        stored,
        SECRET_VAULT_TTL_SECONDS,
    )
    return stored


async def get_secret_plaintext(
    *,
    conversation_id: str,
    widget_id: str,
    field_name: str,
) -> str | None:
    """读取并解密单个字段；过期或不存在返回 None。"""
    cid = (conversation_id or "").strip()
    wid = (widget_id or "").strip()
    fname = (field_name or "").strip()
    if not cid or not wid or not fname:
        return None

    rk = _redis_key(cid, wid, fname)
    token: str | None = None
    try:
        from app.core.redis_client import get_redis

        r = get_redis()
        token = await r.get(rk)
    except Exception:
        pass

    if not token:
        _purge_memory_expired()
        entry = _memory_store.get(rk)
        if entry and entry[0] > time.monotonic():
            token = entry[1]

    if not token:
        return None

    try:
        return _fernet().decrypt(token.encode("ascii")).decode("utf-8")
    except InvalidToken:
        logger.warning("Vault 解密失败 conv=%s widget=%s field=%s", cid, wid, fname)
        return None


def make_secret_ref(widget_id: str, field_name: str) -> str:
    """构造 secret:// 引用字符串。"""
    return f"{SECRET_REF_PREFIX}{widget_id.strip()}/{field_name.strip()}"


def parse_secret_ref(value: str) -> tuple[str, str] | None:
    """解析 secret://widget/field；非法返回 None。"""
    m = _REF_PATTERN.match((value or "").strip())
    if not m:
        return None
    return m.group(1), m.group(2)


async def resolve_secret_refs_in_value(
    value: Any,
    *,
    conversation_id: str,
) -> Any:
    """递归解析 dict/list/str 中的 secret:// 引用。"""
    if isinstance(value, str):
        parsed = parse_secret_ref(value)
        if not parsed:
            return value
        wid, fname = parsed
        plain = await get_secret_plaintext(
            conversation_id=conversation_id,
            widget_id=wid,
            field_name=fname,
        )
        if plain is None:
            raise ValueError(
                f"敏感字段引用已过期或不存在: secret://{wid}/{fname} "
                f"（表单数据仅保留 {SECRET_VAULT_TTL_SECONDS // 60} 分钟）"
            )
        return plain
    if isinstance(value, list):
        return [
            await resolve_secret_refs_in_value(v, conversation_id=conversation_id)
            for v in value
        ]
    if isinstance(value, dict):
        return {
            k: await resolve_secret_refs_in_value(v, conversation_id=conversation_id)
            for k, v in value.items()
        }
    return value


def mask_secret_refs_for_display(value: Any) -> Any:
    """日志/SSE 预览用：将 secret:// 引用打码。"""
    if isinstance(value, str):
        if parse_secret_ref(value):
            return "【已隐藏敏感字段】"
        return value
    if isinstance(value, list):
        return [mask_secret_refs_for_display(v) for v in value]
    if isinstance(value, dict):
        return {k: mask_secret_refs_for_display(v) for k, v in value.items()}
    return value


def build_form_resume_hint(widget_id: str, field_names: list[str]) -> str:
    """生成给 LLM 的用户消息占位文案（含各字段 ref）。"""
    refs = ", ".join(make_secret_ref(widget_id, n) for n in field_names)
    return (
        f"【用户已通过表单提交敏感信息（{len(field_names)} 项），"
        f"请在工具参数中使用以下引用，勿向用户重复索要明文】 {refs}"
    )

"""SMTP 验证码发信（同步 async），Redis 节流与 TTL 对齐参考 ai-travel-auth。"""

from __future__ import annotations

import random
from enum import Enum

import redis.asyncio as redis

from app.core.config import get_settings
from app.core.exceptions import ValidationError
from app.core.logging import get_logger
from app.core.redis_client import get_redis

logger = get_logger(__name__)

CODE_TTL_SEC = 600
LIMIT_TTL_SEC = 60


class MailScene(str, Enum):
    """Mail Scene."""
    REGISTER = "register"
    CHANGE_PASSWORD = "changePassword"
    FORGOT_PASSWORD = "forgotPassword"
    UNBIND_THIRD = "unbindThird"
    EMAIL_LOGIN = "emailLogin"


SUBJECT_SCENE = {
    MailScene.REGISTER: "TCM — 验证码",
    MailScene.CHANGE_PASSWORD: "TCM — 修改密码验证码",
    MailScene.FORGOT_PASSWORD: "TCM — 重置密码验证码",
    MailScene.UNBIND_THIRD: "TCM — 解除第三方绑定验证码",
    MailScene.EMAIL_LOGIN: "TCM — 登录验证码",
}


def _norm_email(email: str) -> str:
    """Internal helper: norm email."""
    return email.strip().lower()


def redis_register_code(email: str) -> str:
    """Redis register code (``email``)."""
    return f"auth:code:register:{_norm_email(email)}"


def redis_register_limit(email: str) -> str:
    """Redis register limit (``email``)."""
    return f"auth:email:limit:{_norm_email(email)}"


def redis_change_pwd_code(email: str) -> str:
    """Redis change pwd code (``email``)."""
    return f"auth:code:changePwd:{_norm_email(email)}"


def redis_change_limit(email: str) -> str:
    """Redis change limit (``email``)."""
    return f"auth:email:limit:change:{_norm_email(email)}"


def redis_forgot_code(email: str) -> str:
    """Redis forgot code (``email``)."""
    return f"auth:code:forgotPwd:{_norm_email(email)}"


def redis_forgot_limit(email: str) -> str:
    """Redis forgot limit (``email``)."""
    return f"auth:email:limit:forgot:{_norm_email(email)}"


def redis_email_login_limit(email: str) -> str:
    """Redis email login limit (``email``)."""
    return f"auth:email:limit:emailLogin:{_norm_email(email)}"


def redis_email_login_code(email: str) -> str:
    """Redis email login code (``email``)."""
    return f"auth:code:emailLogin:{_norm_email(email)}"


def redis_unbind_code(user_id: str, provider: str) -> str:
    """Redis unbind code (``user_id``, ``provider``)."""
    return f"auth:code:unbind:{user_id}:{provider}"


def redis_unbind_limit(user_id: str, provider: str) -> str:
    """Redis unbind limit (``user_id``, ``provider``)."""
    return f"auth:email:limit:unbind:{user_id}:{provider}"


def _six_digit_code() -> str:
    """Internal helper: six digit code."""
    return f"{random.randint(0, 999999):06d}"


async def _rate_limit_ok(r: redis.Redis, key: str, *, fail_message: str) -> None:
    """Internal helper: rate limit ok."""
    if await r.exists(key):
        raise ValidationError(fail_message)
    await r.setex(key, LIMIT_TTL_SEC, "1")


async def ensure_send_register_code(email: str) -> str:
    """生成并写入验证码，返回六位码字符串。"""
    if not email or not email.strip():
        raise ValidationError("邮箱不能为空")
    email = email.strip()
    em = _norm_email(email)
    r = get_redis()
    await _rate_limit_ok(r, redis_register_limit(email), fail_message="发送过于频繁，请 1 分钟后再试")
    code = _six_digit_code()
    await r.setex(redis_register_code(em), CODE_TTL_SEC, code)
    await _send_smtp(em, code, MailScene.REGISTER)
    return code


async def ensure_send_change_password(email: str) -> str:
    """Ensure send change password (``email``)."""
    if not email or not email.strip():
        raise ValidationError("邮箱不能为空")
    email = email.strip()
    em = _norm_email(email)
    r = get_redis()
    await _rate_limit_ok(r, redis_change_limit(email), fail_message="发送过于频繁，请 1 分钟后再试")
    code = _six_digit_code()
    await r.setex(redis_change_pwd_code(em), CODE_TTL_SEC, code)
    await _send_smtp(em, code, MailScene.CHANGE_PASSWORD)
    return code


async def ensure_send_forgot_password(email: str) -> str:
    """Ensure send forgot password (``email``)."""
    if not email or not email.strip():
        raise ValidationError("邮箱不能为空")
    email = email.strip()
    em = _norm_email(email)
    r = get_redis()
    await _rate_limit_ok(r, redis_forgot_limit(email), fail_message="发送过于频繁，请 1 分钟后再试")
    code = _six_digit_code()
    await r.setex(redis_forgot_code(em), CODE_TTL_SEC, code)
    await _send_smtp(em, code, MailScene.FORGOT_PASSWORD)
    return code


async def ensure_send_email_login(email: str) -> str:
    """登录邮箱验证码：需业务层先确认该邮箱已注册用户。"""
    if not email or not email.strip():
        raise ValidationError("邮箱不能为空")
    email = email.strip()
    em = _norm_email(email)
    r = get_redis()
    await _rate_limit_ok(r, redis_email_login_limit(email), fail_message="发送过于频繁，请 1 分钟后再试")
    code = _six_digit_code()
    await r.setex(redis_email_login_code(em), CODE_TTL_SEC, code)
    await _send_smtp(em, code, MailScene.EMAIL_LOGIN)
    return code


async def ensure_send_unbind_code(user_id: str, provider: str, email: str) -> str:
    """Ensure send unbind code (``user_id``, ``provider``, ``email``)."""
    if not provider or not email or not email.strip():
        raise ValidationError("邮箱或第三方类型不能为空")
    email = email.strip()
    em = _norm_email(email)
    r = get_redis()
    await _rate_limit_ok(
        r, redis_unbind_limit(user_id, provider), fail_message="发送过于频繁，请 1 分钟后再试"
    )
    code = _six_digit_code()
    await r.setex(redis_unbind_code(user_id, provider), CODE_TTL_SEC, code)
    await _send_smtp(em, code, MailScene.UNBIND_THIRD)
    return code


async def _send_smtp(email: str, code: str, scene: MailScene) -> None:
    """Internal helper: send smtp."""
    s = get_settings()
    if s.mail_skip_send or not (s.mail_host and s.mail_username):
        logger.warning(
            "[mail] 跳过真实投递 scene=%s to=%s code=%s (MAIL_SKIP_SEND 或未配置 SMTP)",
            scene,
            email,
            code,
        )
        return
    subject = SUBJECT_SCENE[scene]
    body = (
        f"<p>验证码：<strong>{code}</strong></p>"
        f"<p>有效时长 10 分钟。如非本人操作请忽略。</p>"
    )

    def _smtp_send_sync() -> None:
        """Internal helper: smtp send sync."""
        import smtplib
        from email.message import EmailMessage

        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = s.mail_username
        msg["To"] = email
        msg.set_content(body, subtype="html")
        port = int(s.mail_port)
        if port == 465:
            with smtplib.SMTP_SSL(s.mail_host, port, timeout=25) as smtp:
                smtp.login(s.mail_username, s.mail_code)
                smtp.send_message(msg)
        else:
            with smtplib.SMTP(s.mail_host, port, timeout=25) as smtp:
                smtp.starttls()
                smtp.login(s.mail_username, s.mail_code)
                smtp.send_message(msg)

    try:
        import asyncio

        await asyncio.to_thread(_smtp_send_sync)
    except Exception:
        logger.exception(
            "[mail] SMTP send failed scene=%s to=%s (验证码已写入 Redis)", scene, email
        )


async def pop_register_code_if_match(email: str, code: str) -> bool:
    """Pop register code if match (``email``, ``code``)."""
    em = _norm_email(email)
    key = redis_register_code(em)
    r = get_redis()
    stored = await r.get(key)
    if stored is None or stored.strip() != code.strip():
        return False
    await r.delete(key)
    return True


async def register_code_valid(email: str, code: str) -> bool:
    """Register code valid (``email``, ``code``)."""
    em = _norm_email(email)
    key = redis_register_code(em)
    r = get_redis()
    stored = await r.get(key)
    return stored is not None and stored.strip() == code.strip()


async def delete_register_code(email: str) -> None:
    """Delete register code (``email``)."""
    await get_redis().delete(redis_register_code(_norm_email(email)))


async def pop_change_password_code_if_match(email: str, code: str) -> bool:
    """Pop change password code if match (``email``, ``code``)."""
    em = _norm_email(email)
    key = redis_change_pwd_code(em)
    r = get_redis()
    stored = await r.get(key)
    if stored is None or stored.strip() != code.strip():
        return False
    await r.delete(key)
    return True


async def pop_forgot_code_if_match(email: str, code: str) -> bool:
    """Pop forgot code if match (``email``, ``code``)."""
    em = _norm_email(email)
    key = redis_forgot_code(em)
    r = get_redis()
    stored = await r.get(key)
    if stored is None or stored.strip() != code.strip():
        return False
    await r.delete(key)
    return True


async def pop_email_login_code_if_match(email: str, code: str) -> bool:
    """Pop email login code if match (``email``, ``code``)."""
    em = _norm_email(email)
    key = redis_email_login_code(em)
    r = get_redis()
    stored = await r.get(key)
    if stored is None or stored.strip() != code.strip():
        return False
    await r.delete(key)
    return True


async def pop_unbind_code_if_match(user_id: str, provider: str, code: str) -> bool:
    """Pop unbind code if match (``user_id``, ``provider``, ``code``)."""
    key = redis_unbind_code(user_id, provider)
    r = get_redis()
    stored = await r.get(key)
    if stored is None or stored.strip() != code.strip():
        return False
    await r.delete(key)
    return True

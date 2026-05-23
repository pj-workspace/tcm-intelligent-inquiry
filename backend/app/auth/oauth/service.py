"""OAuth 业务：state、login code、thirdFlow、用户绑定。"""

from __future__ import annotations

import re
import secrets
import uuid
from urllib.parse import urlencode

import httpx
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.security.jwt_codec import create_access_token
from app.auth.services.mail_service import delete_register_code, register_code_valid
from app.auth.models import UserOauthAccount, UserRecord, utc_naive_now
from app.auth.oauth.providers import get_provider
from app.auth.oauth.providers.base import OAuthUserProfile
from app.auth.security.password import hash_password
from app.auth.schemas import TokenResponse
from app.core.config import get_settings
from app.core.exceptions import ConflictError, UnauthorizedError, ValidationError
from app.core.logging import get_logger
from app.core.redis_client import get_redis

logger = get_logger(__name__)

STATE_PREFIX = "oauth:state:"
LOGIN_PREFIX = "oauth:login:"
FLOW_PREFIX = "oauth:flow:email:"
REDIS_TTL = 600


def _redirect_base() -> str:
    """Internal helper: redirect base."""
    u = (get_settings().frontend_url or "http://localhost:3000").rstrip("/")
    return u


def _login_oauth_url(query: str) -> str:
    """OAuth 回跳必须落在 /login：换 code、thirdFlow、错误提示均在 AuthForm 内处理。"""
    return f"{_redirect_base()}/login?{query}"


def _random_password_hash() -> str:
    """Internal helper: random password hash."""
    return hash_password(secrets.token_hex(24))


def _sanitize_username_base(raw: str | None) -> str:
    """Internal helper: sanitize username base."""
    s = re.sub(r"[^a-zA-Z0-9_\u4e00-\u9fff]", "_", (raw or "user").strip())[:48]
    return s or "user"


async def _unique_username(session: AsyncSession, base: str) -> str:
    """Internal helper: unique username."""
    b = _sanitize_username_base(base)
    for _ in range(12):
        cand = b if _ == 0 else f"{b}_{secrets.token_hex(2)}"
        r = await session.execute(select(UserRecord.id).where(UserRecord.username == cand))
        if r.scalar_one_or_none() is None:
            return cand
    return f"u_{uuid.uuid4().hex[:12]}"


async def build_authorize_url(provider_name: str) -> str:
    """Build authorize url (``provider_name``)."""
    prov = get_provider(provider_name)
    state = secrets.token_urlsafe(24)
    r = get_redis()
    await r.setex(f"{STATE_PREFIX}{state}", REDIS_TTL, prov.provider)
    redir = _callback_uri(prov.provider)
    return prov.authorize_url(state=state, redirect_uri=redir)


def _callback_uri(provider: str) -> str:
    """Internal helper: callback uri."""
    s = get_settings()
    if provider == "github":
        return (s.github_redirect_uri or "").strip()
    if provider == "gitee":
        return (s.gitee_redirect_uri or "").strip()
    raise ValidationError("未知 provider")


async def handle_oauth_callback(
    session: AsyncSession, provider_name: str, code: str | None, state: str | None, oauth_error: str | None
) -> str:
    """返回完整 302 URL（query 已编码）。"""
    if oauth_error:
        q = urlencode({"oauth_error": oauth_error})
        return _login_oauth_url(q)
    if not code or not state:
        return _login_oauth_url(urlencode({"oauth_error": "missing_code_or_state"}))

    r = get_redis()
    sk = f"{STATE_PREFIX}{state}"
    stored_provider = await r.get(sk)
    if not stored_provider or stored_provider != provider_name.lower():
        return _login_oauth_url(urlencode({"oauth_error": "invalid_state"}))
    await r.delete(sk)

    prov = get_provider(provider_name)
    try:
        profile = await prov.exchange_and_profile(code=code, redirect_uri=_callback_uri(prov.provider))
    except (httpx.HTTPError, ValueError, KeyError) as e:
        logger.warning("oauth exchange failed provider=%s: %s", provider_name, e)
        return _login_oauth_url(urlencode({"oauth_error": "token_exchange_failed"}))

    return await _after_profile(session, prov.provider, profile)


async def _after_profile(session: AsyncSession, provider: str, profile: OAuthUserProfile) -> str:
    """Internal helper: after profile."""
    ext_id = profile.external_id
    rbind = await session.execute(
        select(UserOauthAccount).where(
            UserOauthAccount.provider == provider,
            UserOauthAccount.external_id == ext_id,
        )
    )
    existing = rbind.scalar_one_or_none()
    if existing:
        existing.last_login_at = utc_naive_now()
        await session.flush()
        return await _login_redirect_for_user(session, existing.user_id)

    email = None
    if profile.primary_email and profile.primary_email.strip():
        if profile.primary_email_verified or provider == "gitee":
            email = profile.primary_email.strip().lower()

    if email:
        ru = await session.execute(select(UserRecord).where(UserRecord.email == email))
        user = ru.scalar_one_or_none()
        if user:
            await _attach_account(
                session,
                user_id=user.id,
                provider=provider,
                profile=profile,
            )
            return await _login_redirect_for_user(session, user.id)
        uid = str(uuid.uuid4())
        uname = await _unique_username(session, profile.login or email.split("@")[0])
        user = UserRecord(
            id=uid,
            username=uname,
            password_hash=_random_password_hash(),
            email=email,
            email_verified=profile.primary_email_verified,
        )
        session.add(user)
        await session.flush()
        await _attach_account(session, user_id=uid, provider=provider, profile=profile)
        return await _login_redirect_for_user(session, uid)

    flow_id = secrets.token_urlsafe(18)
    nick = profile.nickname or profile.login or ""
    av = profile.avatar_url or ""
    packed = "|".join([provider, ext_id, nick, av])
    await get_redis().setex(f"{FLOW_PREFIX}{flow_id}", REDIS_TTL, packed)
    q = urlencode({"thirdFlow": flow_id, "provider": provider})
    return _login_oauth_url(q)


async def _attach_account(
    session: AsyncSession,
    *,
    user_id: str,
    provider: str,
    profile: OAuthUserProfile,
) -> None:
    """Internal helper: _attach_account."""
    row = UserOauthAccount(
        id=str(uuid.uuid4()),
        provider=provider,
        external_id=profile.external_id,
        user_id=user_id,
        external_email=profile.primary_email,
        external_nickname=profile.nickname,
        external_avatar=profile.avatar_url,
        last_login_at=utc_naive_now(),
    )
    session.add(row)


async def _login_redirect_for_user(session: AsyncSession, user_id: str) -> str:
    """Internal helper: login redirect for user."""
    u = await session.get(UserRecord, user_id)
    if not u:
        raise ValidationError("用户不存在")
    code = secrets.token_urlsafe(32)
    await get_redis().setex(f"{LOGIN_PREFIX}{code}", REDIS_TTL, user_id)
    return _login_oauth_url(urlencode({"code": code}))


async def exchange_login_code(session: AsyncSession, login_code: str) -> TokenResponse:
    """Exchange login code (``session``, ``login_code``)."""
    if not login_code or not login_code.strip():
        raise UnauthorizedError("缺少 code")
    key = f"{LOGIN_PREFIX}{login_code.strip()}"
    r = get_redis()
    uid = await r.get(key)
    if not uid:
        raise UnauthorizedError("code 无效或已过期")
    await r.delete(key)
    user = await session.get(UserRecord, uid)
    if not user:
        raise UnauthorizedError("用户不存在")
    token, exp = create_access_token(
        subject=user.id,
        extra={"username": user.username, "email": user.email or ""},
    )
    return TokenResponse(access_token=token, expires_in=exp)


async def complete_third_flow(
    session: AsyncSession,
    *,
    flow_id: str,
    email: str,
    code: str,
    password: str | None,
    nickname: str | None,
) -> dict:
    """Complete third flow。"""
    r = get_redis()
    raw = await r.get(f"{FLOW_PREFIX}{flow_id.strip()}")
    if not raw:
        raise ValidationError("登录补全已过期，请重新发起第三方登录")
    parts = raw.split("|", 3)
    if len(parts) < 2:
        raise ValidationError("补全数据异常")
    provider, ext_id = parts[0], parts[1]
    ext_nick = parts[2] if len(parts) > 2 else ""
    ext_av = parts[3] if len(parts) > 3 else ""

    if not await register_code_valid(email, code):
        raise ValidationError("验证码无效或已过期")

    prof = OAuthUserProfile(
        external_id=ext_id,
        login=None,
        nickname=ext_nick or None,
        avatar_url=ext_av or None,
        primary_email=None,
        primary_email_verified=False,
    )

    ex = await session.execute(
        select(UserOauthAccount).where(
            UserOauthAccount.provider == provider,
            UserOauthAccount.external_id == ext_id,
        )
    )
    bind = ex.scalar_one_or_none()
    if bind:
        await r.delete(f"{FLOW_PREFIX}{flow_id.strip()}")
        await delete_register_code(email)
        token, exp = await _token_for_user_id(session, bind.user_id)
        return {
            "need_password": False,
            "access_token": token,
            "token_type": "bearer",
            "expires_in": exp,
        }

    em = email.strip().lower()
    ru = await session.execute(select(UserRecord).where(UserRecord.email == em))
    user = ru.scalar_one_or_none()

    if user is None:
        if not password or len(password) < 6:
            return {
                "need_password": True,
                "suggest_nickname": ext_nick or em.split("@")[0],
            }
        uid = str(uuid.uuid4())
        uname = await _unique_username(session, nickname or ext_nick or em.split("@")[0])
        user = UserRecord(
            id=uid,
            username=uname,
            password_hash=hash_password(password),
            email=em,
            email_verified=True,
        )
        session.add(user)
        try:
            await session.flush()
        except IntegrityError as e:
            await session.rollback()
            logger.warning("complete flow create user conflict: %s", e)
            raise ConflictError("邮箱已被注册，请改用该账号登录后再绑定") from e
        await _attach_account(session, user_id=uid, provider=provider, profile=prof)
        await r.delete(f"{FLOW_PREFIX}{flow_id.strip()}")
        await delete_register_code(email)
        token, exp = await _token_for_user_id(session, uid)
        return {
            "need_password": False,
            "access_token": token,
            "token_type": "bearer",
            "expires_in": exp,
        }

    await _attach_account(session, user_id=user.id, provider=provider, profile=prof)
    await r.delete(f"{FLOW_PREFIX}{flow_id.strip()}")
    await delete_register_code(email)
    token, exp = await _token_for_user_id(session, user.id)
    return {
        "need_password": False,
        "access_token": token,
        "token_type": "bearer",
        "expires_in": exp,
    }


async def _token_for_user_id(session: AsyncSession, user_id: str) -> tuple[str, int]:
    """Internal helper: token for user id."""
    user = await session.get(UserRecord, user_id)
    if not user:
        raise ValidationError("用户不存在")
    return create_access_token(subject=user.id, extra={"username": user.username, "email": user.email or ""})


async def list_bindings(session: AsyncSession, user_id: str) -> list[dict]:
    """List bindings (``session``, ``user_id``)."""
    r = await session.execute(
        select(UserOauthAccount).where(UserOauthAccount.user_id == user_id)
    )
    rows = r.scalars().all()
    return [
        {
            "provider": x.provider,
            "external_nickname": x.external_nickname,
            "external_avatar": x.external_avatar,
            "created_at": x.created_at.isoformat() if x.created_at else None,
        }
        for x in rows
    ]


async def send_unbind_code(user_id: str, email: str | None, provider: str) -> None:
    """Send unbind code (``user_id``, ``email``, ``provider``)."""
    if not email or not email.strip():
        raise ValidationError("当前账号未绑定邮箱，无法进行解绑验证")
    from app.auth.services.mail_service import ensure_send_unbind_code

    await ensure_send_unbind_code(user_id, provider, email.strip())


async def verify_unbind(
    session: AsyncSession, user_id: str, email: str | None, provider: str, code: str
) -> None:
    """Verify unbind。"""
    if not email or not email.strip():
        raise ValidationError("当前账号未绑定邮箱，无法进行解绑验证")
    from app.auth.services.mail_service import pop_unbind_code_if_match

    ok = await pop_unbind_code_if_match(user_id, provider, code)
    if not ok:
        raise ValidationError("验证码错误或已失效")
    await session.execute(
        delete(UserOauthAccount).where(
            UserOauthAccount.user_id == user_id,
            UserOauthAccount.provider == provider,
        )
    )

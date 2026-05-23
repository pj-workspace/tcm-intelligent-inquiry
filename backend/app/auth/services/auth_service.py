"""注册与登录，及邮箱验证码、忘记密码、改密。"""

import re
import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import UserRecord
from app.auth.schemas import (
    ChangePasswordIn,
    CheckPasswordIn,
    EmailCodeLoginIn,
    ForgotResetIn,
    LoginRequest,
    MessageOut,
    RegisterRequest,
    TokenResponse,
    UserPublic,
)
from app.auth.security.jwt_codec import create_access_token
from app.auth.security.password import hash_password, verify_password
from app.auth.services.mail_service import (
    ensure_send_change_password,
    ensure_send_email_login,
    ensure_send_forgot_password,
    ensure_send_register_code,
    pop_change_password_code_if_match,
    pop_email_login_code_if_match,
    pop_forgot_code_if_match,
    pop_register_code_if_match,
)
from app.core.exceptions import UnauthorizedError, ValidationError
from app.core.logging import get_logger

logger = get_logger(__name__)


_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class AuthService:
    """Auth Service."""
    def __init__(self, session: AsyncSession):
        """Initialize instance."""
        self._session = session

    async def register(self, req: RegisterRequest) -> UserPublic:
        """Register (``req``)."""
        r = await self._session.execute(
            select(UserRecord).where(UserRecord.username == req.username.strip())
        )
        if r.scalar_one_or_none() is not None:
            raise ValidationError("用户名已存在")

        email_clean = req.email.strip().lower()
        if not _EMAIL_RE.match(email_clean):
            raise ValidationError("邮箱格式不正确")
        r2 = await self._session.execute(
            select(UserRecord.id).where(UserRecord.email == email_clean)
        )
        if r2.scalar_one_or_none() is not None:
            raise ValidationError("该邮箱已被注册")

        if not await pop_register_code_if_match(email_clean, req.email_code.strip()):
            raise ValidationError("验证码错误或已过期")

        uid = str(uuid.uuid4())
        row = UserRecord(
            id=uid,
            username=req.username.strip(),
            password_hash=hash_password(req.password),
            email=email_clean,
            email_verified=True,
        )
        self._session.add(row)
        try:
            await self._session.flush()
        except IntegrityError as e:
            logger.warning("register integrity: %s", e)
            raise ValidationError("注册失败（邮箱或用户名冲突）") from e
        logger.info("注册用户 id=%s username=%s", uid, row.username)
        return UserPublic(
            id=row.id,
            username=row.username,
            email=row.email,
            email_verified=row.email_verified,
        )

    async def login(self, req: LoginRequest) -> TokenResponse:
        """Login (``req``)."""
        raw = req.username.strip()
        if not raw:
            raise UnauthorizedError("用户名或密码错误")

        if "@" in raw:
            email_key = raw.lower()
            if not _EMAIL_RE.match(email_key):
                raise UnauthorizedError("用户名或密码错误")
            r = await self._session.execute(
                select(UserRecord).where(UserRecord.email == email_key)
            )
        else:
            r = await self._session.execute(
                select(UserRecord).where(UserRecord.username == raw)
            )
        row = r.scalar_one_or_none()
        if row is None or not verify_password(req.password, row.password_hash):
            raise UnauthorizedError("用户名或密码错误")

        token, expires_in = create_access_token(
            subject=row.id,
            extra={"username": row.username, "email": row.email or ""},
        )
        return TokenResponse(access_token=token, expires_in=expires_in)

    async def send_email_login_code(self, email: str) -> MessageOut:
        """Send email login code (``email``)."""
        if not email or not email.strip():
            raise ValidationError("邮箱不能为空")
        em = email.strip().lower()
        if not _EMAIL_RE.match(em):
            raise ValidationError("邮箱格式不正确")
        r = await self._session.execute(select(UserRecord).where(UserRecord.email == em))
        if r.scalar_one_or_none() is None:
            raise ValidationError("不存在使用此邮箱注册的账号")
        await ensure_send_email_login(em)
        return MessageOut(message="验证码已发送")

    async def login_with_email_code(self, body: EmailCodeLoginIn) -> TokenResponse:
        """Login with email code (``body``)."""
        em = body.email.strip().lower()
        if not _EMAIL_RE.match(em):
            raise ValidationError("邮箱格式不正确")
        if not await pop_email_login_code_if_match(em, body.code.strip()):
            raise UnauthorizedError("验证码错误或已过期")
        r = await self._session.execute(select(UserRecord).where(UserRecord.email == em))
        row = r.scalar_one_or_none()
        if row is None:
            raise UnauthorizedError("登录失败")
        token, expires_in = create_access_token(
            subject=row.id,
            extra={"username": row.username, "email": row.email or ""},
        )
        return TokenResponse(access_token=token, expires_in=expires_in)

    async def send_register_code(self, email: str) -> MessageOut:
        """Send register code (``email``)."""
        if not email or not email.strip():
            raise ValidationError("邮箱不能为空")
        em = email.strip().lower()
        if not _EMAIL_RE.match(em):
            raise ValidationError("邮箱格式不正确")
        await ensure_send_register_code(em)
        return MessageOut(message="验证码已发送，请查收邮件")

    async def send_forgot_code(self, email: str) -> MessageOut:
        """Send forgot code (``email``)."""
        if not email or not email.strip():
            raise ValidationError("邮箱不能为空")
        em = email.strip().lower()
        r = await self._session.execute(select(UserRecord).where(UserRecord.email == em))
        if r.scalar_one_or_none() is None:
            raise ValidationError("不存在使用此邮箱注册的账号")
        await ensure_send_forgot_password(em)
        return MessageOut(message="验证码已发送")

    async def reset_forgotten_password(self, body: ForgotResetIn) -> MessageOut:
        """Reset forgotten password (``body``)."""
        em = body.email.strip().lower()
        r = await self._session.execute(select(UserRecord).where(UserRecord.email == em))
        row = r.scalar_one_or_none()
        if row is None:
            raise ValidationError("用户不存在")
        ok = await pop_forgot_code_if_match(em, body.code)
        if not ok:
            raise ValidationError("验证码无效或已过期")
        row.password_hash = hash_password(body.new_password)
        await self._session.flush()
        return MessageOut(message="密码已重置")

    async def send_change_password_code(self, user: UserRecord) -> MessageOut:
        """Send change password code (``user``)."""
        if not user.email:
            raise ValidationError("请先绑定邮箱后再修改密码（个人资料中填写邮箱）")
        await ensure_send_change_password(user.email.strip().lower())
        return MessageOut(message="验证码已发送")

    async def check_password(self, user: UserRecord, body: CheckPasswordIn) -> MessageOut:
        """Check password (``user``, ``body``)."""
        if not verify_password(body.password, user.password_hash):
            raise UnauthorizedError("当前密码错误")
        return MessageOut(message="密码正确")

    async def change_password(self, user: UserRecord, body: ChangePasswordIn) -> MessageOut:
        """Change password (``user``, ``body``)."""
        if not user.email:
            raise ValidationError("请先绑定邮箱")
        em = user.email.strip().lower()
        ok = await pop_change_password_code_if_match(em, body.code)
        if not ok:
            raise ValidationError("验证码无效或已过期")
        if not verify_password(body.old_password, user.password_hash):
            raise ValidationError("旧密码不正确")
        user.password_hash = hash_password(body.new_password)
        await self._session.flush()
        return MessageOut(message="密码已修改")

"""认证路由。"""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.api.deps import get_current_user
from app.auth.models import UserRecord
from app.auth.schemas import (
    ChangePasswordIn,
    CheckPasswordIn,
    EmailCodeLoginIn,
    ForgotResetIn,
    LoginRequest,
    MessageOut,
    RegisterRequest,
    SendCodeIn,
    TokenResponse,
    UserPublic,
)
from app.auth.services.auth_service import AuthService
from app.core.database import get_session


def _svc(session: AsyncSession = Depends(get_session)) -> AuthService:
    """Internal helper: svc."""
    return AuthService(session)


router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=UserPublic, summary="注册账号")
async def register(req: RegisterRequest, svc: AuthService = Depends(_svc)):
    """Register (``req``, ``svc``)."""
    return await svc.register(req)


@router.post("/login", response_model=TokenResponse, summary="登录获取 JWT（用户名或绑定邮箱）")
async def login(req: LoginRequest, svc: AuthService = Depends(_svc)):
    """Login (``req``, ``svc``)."""
    return await svc.login(req)


@router.post(
    "/code/send-email-login",
    summary="登录：向已注册邮箱发送验证码（无密码登录）",
)
async def send_email_login_code(body: SendCodeIn, svc: AuthService = Depends(_svc)):
    """Send email login code (``body``, ``svc``)."""
    return await svc.send_email_login_code(body.email)


@router.post(
    "/login-email-code",
    response_model=TokenResponse,
    summary="邮箱验证码登录",
)
async def login_email_code(body: EmailCodeLoginIn, svc: AuthService = Depends(_svc)):
    """Login email code (``body``, ``svc``)."""
    return await svc.login_with_email_code(body)


@router.get("/me", response_model=UserPublic, summary="当前登录用户")
async def me(user: Annotated[UserRecord, Depends(get_current_user)]):
    """Me (``user``)."""
    return UserPublic(
        id=user.id,
        username=user.username,
        email=user.email,
        email_verified=user.email_verified,
    )


@router.post("/code/send", summary="发送邮箱验证码（注册 / 第三方补全）")
async def send_auth_code(body: SendCodeIn, svc: AuthService = Depends(_svc)):
    """Send auth code (``body``, ``svc``)."""
    return await svc.send_register_code(body.email)


@router.post("/code/send-forgot", summary="忘记密码：发送验证码")
async def send_forgot_code(body: SendCodeIn, svc: AuthService = Depends(_svc)):
    """Send forgot code (``body``, ``svc``)."""
    return await svc.send_forgot_code(body.email)


@router.post("/forgot-reset", summary="忘记密码：重置")
async def forgot_reset(body: ForgotResetIn, svc: AuthService = Depends(_svc)):
    """Forgot reset (``body``, ``svc``)."""
    return await svc.reset_forgotten_password(body)


@router.post(
    "/code/send-change-password",
    summary="登录后修改密码：发送验证码（发到当前用户邮箱）",
)
async def send_change_pwd_code(
    user: Annotated[UserRecord, Depends(get_current_user)],
    svc: AuthService = Depends(_svc),
):
    """Send change pwd code。"""
    return await svc.send_change_password_code(user)


@router.post("/check-password", summary="校验当前密码是否正确")
async def check_password(
    body: CheckPasswordIn,
    user: Annotated[UserRecord, Depends(get_current_user)],
    svc: AuthService = Depends(_svc),
):
    """Check password。"""
    return await svc.check_password(user, body)


@router.post("/change-password", summary="修改密码（需邮箱验证码）")
async def change_password_route(
    body: ChangePasswordIn,
    user: Annotated[UserRecord, Depends(get_current_user)],
    svc: AuthService = Depends(_svc),
):
    """Change password。"""
    return await svc.change_password(user, body)

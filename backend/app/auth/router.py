"""认证路由。"""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.auth.models import UserRecord
from app.auth.schemas import LoginRequest, RegisterRequest, TokenResponse, UserPublic
from app.auth.service import AuthService
from app.core.database import get_session

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _svc(session: AsyncSession = Depends(get_session)) -> AuthService:
    return AuthService(session)


@router.post("/register", response_model=UserPublic, summary="注册账号")
async def register(req: RegisterRequest, svc: AuthService = Depends(_svc)):
    return await svc.register(req)


@router.post("/login", response_model=TokenResponse, summary="登录获取 JWT")
async def login(req: LoginRequest, svc: AuthService = Depends(_svc)):
    return await svc.login(req)


@router.get("/me", response_model=UserPublic, summary="当前登录用户")
async def me(user: Annotated[UserRecord, Depends(get_current_user)]):
    return UserPublic(id=user.id, username=user.username)

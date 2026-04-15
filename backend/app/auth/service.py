"""注册与登录。"""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt_codec import create_access_token
from app.auth.models import UserRecord
from app.auth.password import hash_password, verify_password
from app.auth.schemas import LoginRequest, RegisterRequest, TokenResponse, UserPublic
from app.core.exceptions import UnauthorizedError, ValidationError
from app.core.logging import get_logger

logger = get_logger(__name__)


class AuthService:
    def __init__(self, session: AsyncSession):
        self._session = session

    async def register(self, req: RegisterRequest) -> UserPublic:
        r = await self._session.execute(
            select(UserRecord).where(UserRecord.username == req.username)
        )
        if r.scalar_one_or_none() is not None:
            raise ValidationError("用户名已存在")

        uid = str(uuid.uuid4())
        row = UserRecord(
            id=uid,
            username=req.username.strip(),
            password_hash=hash_password(req.password),
        )
        self._session.add(row)
        await self._session.flush()
        logger.info("注册用户 id=%s username=%s", uid, row.username)
        return UserPublic(id=row.id, username=row.username)

    async def login(self, req: LoginRequest) -> TokenResponse:
        r = await self._session.execute(
            select(UserRecord).where(UserRecord.username == req.username.strip())
        )
        row = r.scalar_one_or_none()
        if row is None or not verify_password(req.password, row.password_hash):
            raise UnauthorizedError("用户名或密码错误")

        token, expires_in = create_access_token(
            subject=row.id, extra={"username": row.username}
        )
        return TokenResponse(access_token=token, expires_in=expires_in)

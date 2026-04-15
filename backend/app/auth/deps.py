"""认证依赖：解析 Bearer Token，加载用户。"""

from typing import Annotated

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.auth.models import UserRecord
from app.core.database import get_session
from app.auth.jwt_codec import decode_token

_security = HTTPBearer(auto_error=False)


async def get_current_user_optional(
    cred: Annotated[HTTPAuthorizationCredentials | None, Depends(_security)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> UserRecord | None:
    if cred is None or cred.scheme.lower() != "bearer":
        return None
    payload = decode_token(cred.credentials)
    if not payload or "sub" not in payload:
        return None
    uid = str(payload["sub"])
    user = await session.get(UserRecord, uid)
    return user


async def get_current_user(
    user: Annotated[UserRecord | None, Depends(get_current_user_optional)],
) -> UserRecord:
    if user is None:
        raise HTTPException(status_code=401, detail="未登录或 Token 无效")
    return user

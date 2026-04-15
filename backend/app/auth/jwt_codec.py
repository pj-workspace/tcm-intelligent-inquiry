"""JWT 签发与校验（HS256）。"""

from datetime import UTC, datetime, timedelta
from typing import Any

from jose import JWTError, jwt

from app.core.config import get_settings


def create_access_token(*, subject: str, extra: dict[str, Any] | None = None) -> tuple[str, int]:
    s = get_settings()
    expire_delta = timedelta(minutes=s.jwt_expire_minutes)
    now = datetime.now(tz=UTC)
    exp = now + expire_delta
    payload: dict[str, Any] = {
        "sub": subject,
        "exp": int(exp.timestamp()),
        "iat": int(now.timestamp()),
    }
    if extra:
        payload.update(extra)
    token = jwt.encode(payload, s.jwt_secret, algorithm="HS256")
    return token, int(expire_delta.total_seconds())


def decode_token(token: str) -> dict[str, Any] | None:
    s = get_settings()
    try:
        return jwt.decode(token, s.jwt_secret, algorithms=["HS256"])
    except JWTError:
        return None

"""密码哈希（bcrypt）。"""

from passlib.context import CryptContext

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    """Hash password (``plain``)."""
    return _pwd.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    """Verify password (``plain``, ``hashed``)."""
    return _pwd.verify(plain, hashed)

"""认证 API 的请求/响应模型。"""

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    """`username` 字段可传登录名，或已绑定邮箱（与注册时一致的小写邮箱）。"""

    username: str = Field(..., min_length=1, max_length=255)
    password: str = Field(..., min_length=1, max_length=128)


class EmailCodeLoginIn(BaseModel):
    """Email Code Login In."""
    email: str = Field(..., min_length=5, max_length=255)
    code: str = Field(..., min_length=6, max_length=8)


class RegisterRequest(BaseModel):
    """Register Request."""
    username: str = Field(..., min_length=2, max_length=64)
    password: str = Field(..., min_length=6, max_length=128)
    email: str = Field(..., min_length=5, max_length=255)
    email_code: str = Field(..., min_length=6, max_length=8)


class UserPublic(BaseModel):
    """User Public."""
    id: str
    username: str
    email: str | None = None
    email_verified: bool = False


class TokenResponse(BaseModel):
    """Token Response data model."""
    access_token: str
    token_type: str = "bearer"
    expires_in: int = Field(description="Token 有效期（秒）")


class SendCodeIn(BaseModel):
    """Send Code In."""
    email: str = Field(..., min_length=3, max_length=255)


class EmailOnlyIn(BaseModel):
    """Email Only In."""
    email: str = Field(..., min_length=3, max_length=255)


class ForgotResetIn(BaseModel):
    """Forgot Reset In."""
    email: str = Field(..., min_length=3, max_length=255)
    code: str = Field(..., min_length=6)
    new_password: str = Field(..., min_length=6, max_length=128)


class CheckPasswordIn(BaseModel):
    """Check Password In."""
    password: str = Field(..., min_length=1)


class ChangePasswordIn(BaseModel):
    """Change Password In."""
    code: str = Field(..., min_length=6)
    old_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=6, max_length=128)


class MessageOut(BaseModel):
    """Message Out."""
    ok: bool = True
    message: str

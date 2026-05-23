"""OAuth API 模型。"""

from pydantic import BaseModel, Field


class AuthorizeUrlOut(BaseModel):
    """Authorize Url Out."""
    authorize_url: str


class LoginCodeExchangeIn(BaseModel):
    """Login Code Exchange In."""
    code: str = Field(..., min_length=8, max_length=128)


class ThirdCompleteIn(BaseModel):
    """Third Complete In."""
    flow_id: str = Field(..., min_length=8, alias="flowId")

    email: str = Field(..., min_length=3, max_length=255)
    code: str = Field(..., min_length=6, max_length=16)
    password: str | None = Field(default=None, max_length=128)
    nickname: str | None = Field(default=None, max_length=64)

    model_config = {"populate_by_name": True}


class ThirdCompleteNeedPasswordOut(BaseModel):
    """Third Complete Need Password Out."""
    need_password: bool = True
    suggest_nickname: str | None = None


class UnbindVerifyIn(BaseModel):
    """Unbind Verify In."""
    code: str = Field(..., min_length=6)

"""app/auth/oauth/providers/base.py 模块。"""
from dataclasses import dataclass
from typing import Protocol


@dataclass
class OAuthUserProfile:
    """OAuth User Profile."""
    external_id: str
    login: str | None
    nickname: str | None
    avatar_url: str | None
    primary_email: str | None
    primary_email_verified: bool


class OAuthProviderProto(Protocol):
    """OAuth Provider Proto."""
    provider: str

    def authorize_url(self, *, state: str, redirect_uri: str) -> str:
        """Build provider authorization redirect URL."""
        ...

    async def exchange_and_profile(self, *, code: str, redirect_uri: str) -> OAuthUserProfile:
        """Exchange authorization code and fetch user profile."""
        ...

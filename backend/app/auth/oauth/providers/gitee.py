"""Gitee OAuth API v5 user。"""

from urllib.parse import quote_plus

import httpx

from app.auth.oauth.providers.base import OAuthUserProfile
from app.core.config import get_settings


class GiteeOAuthProvider:
    """Gitee OAuth Provider."""
    provider = "gitee"

    def authorize_url(self, *, state: str, redirect_uri: str) -> str:
        """Authorize url."""
        s = get_settings()
        cid = (s.gitee_client_id or "").strip()
        if not cid:
            raise RuntimeError("未配置 GITEE_CLIENT_ID")
        return (
            "https://gitee.com/oauth/authorize"
            f"?client_id={quote_plus(cid)}"
            f"&redirect_uri={quote_plus(redirect_uri)}"
            "&response_type=code"
            f"&state={quote_plus(state)}"
        )

    async def exchange_and_profile(self, *, code: str, redirect_uri: str) -> OAuthUserProfile:
        """Exchange and profile."""
        s = get_settings()
        async with httpx.AsyncClient(timeout=25.0) as client:
            tok = await client.post(
                "https://gitee.com/oauth/token",
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "client_id": (s.gitee_client_id or "").strip(),
                    "client_secret": (s.gitee_client_secret or "").strip(),
                    "redirect_uri": redirect_uri,
                },
            )
            tok.raise_for_status()
            tj = tok.json()
            at = tj.get("access_token")
            if not at:
                raise ValueError("Gitee 换取 token 失败")
            u = await client.get(
                "https://gitee.com/api/v5/user",
                params={"access_token": at},
            )
            u.raise_for_status()
            uj = u.json()
            ext_id = str(uj.get("id", ""))
            login = uj.get("login")
            nick = uj.get("name") or login
            avatar = uj.get("avatar_url")
            email = uj.get("email")
            return OAuthUserProfile(
                external_id=ext_id,
                login=login if isinstance(login, str) else None,
                nickname=nick if isinstance(nick, str) else None,
                avatar_url=avatar if isinstance(avatar, str) else None,
                primary_email=email if isinstance(email, str) and email.strip() else None,
                primary_email_verified=bool(email),
            )


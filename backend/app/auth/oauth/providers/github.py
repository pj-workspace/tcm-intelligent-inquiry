"""GitHub OAuth（user + emails API）。"""

from urllib.parse import quote_plus

import httpx

from app.auth.oauth.providers.base import OAuthUserProfile
from app.core.config import get_settings


class GithubOAuthProvider:
    """Github OAuth Provider."""
    provider = "github"

    def authorize_url(self, *, state: str, redirect_uri: str) -> str:
        """Authorize url."""
        s = get_settings()
        cid = (s.github_client_id or "").strip()
        if not cid:
            raise RuntimeError("未配置 GITHUB_CLIENT_ID")
        return (
            "https://github.com/login/oauth/authorize"
            f"?client_id={quote_plus(cid)}"
            f"&redirect_uri={quote_plus(redirect_uri)}"
            "&scope=user:email"
            f"&state={quote_plus(state)}"
        )

    async def exchange_and_profile(self, *, code: str, redirect_uri: str) -> OAuthUserProfile:
        """Exchange and profile."""
        s = get_settings()
        headers = {"Accept": "application/json"}
        async with httpx.AsyncClient(timeout=25.0) as client:
            tok = await client.post(
                "https://github.com/login/oauth/access_token",
                data={
                    "client_id": (s.github_client_id or "").strip(),
                    "client_secret": (s.github_client_secret or "").strip(),
                    "code": code,
                    "redirect_uri": redirect_uri,
                },
                headers=headers,
            )
            tok.raise_for_status()
            at = tok.json().get("access_token")
            if not at:
                raise ValueError("GitHub 换取 token 失败")
            h2 = {**headers, "Authorization": f"Bearer {at}"}
            u = await client.get("https://api.github.com/user", headers=h2)
            u.raise_for_status()
            uj = u.json()
            ext_id = str(uj.get("id", ""))
            login = uj.get("login")
            nick = uj.get("name") or login
            avatar = uj.get("avatar_url")
            email = uj.get("email")
            verified = bool(uj.get("email")) if email else False
            if not email:
                em_res = await client.get("https://api.github.com/user/emails", headers=h2)
                em_res.raise_for_status()
                emails_list = em_res.json()
                for row in emails_list:
                    if isinstance(row, dict) and row.get("primary"):
                        email = row.get("email")
                        verified = bool(row.get("verified"))
                        break
                if not email:
                    for row in emails_list:
                        if isinstance(row, dict) and row.get("email"):
                            email = row.get("email")
                            verified = bool(row.get("verified"))
                            break
            return OAuthUserProfile(
                external_id=ext_id,
                login=login if isinstance(login, str) else None,
                nickname=nick if isinstance(nick, str) else None,
                avatar_url=avatar if isinstance(avatar, str) else None,
                primary_email=email if isinstance(email, str) else None,
                primary_email_verified=verified,
            )


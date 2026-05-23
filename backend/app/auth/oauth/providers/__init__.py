"""`auth.oauth.providers` 子包导出与命名空间。"""
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.auth.oauth.providers.base import OAuthProviderProto

_PROVIDERS: dict[str, "OAuthProviderProto"] | None = None


def get_providers() -> dict[str, "OAuthProviderProto"]:
    """Get providers."""
    global _PROVIDERS
    if _PROVIDERS is None:
        from app.auth.oauth.providers.gitee import GiteeOAuthProvider
        from app.auth.oauth.providers.github import GithubOAuthProvider

        _PROVIDERS = {
            "github": GithubOAuthProvider(),
            "gitee": GiteeOAuthProvider(),
        }
    return _PROVIDERS


def get_provider(name: str) -> "OAuthProviderProto":
    """Get provider (``name``)."""
    p = get_providers().get(name.strip().lower())
    if p is None:
        raise ValueError("不支持的第三方类型")
    return p

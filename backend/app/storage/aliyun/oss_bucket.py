"""阿里云 OSS Bucket 工厂（同步；于路由内用 asyncio.to_thread 调用）。"""

from __future__ import annotations

import oss2

from app.core.config import Settings, get_settings


class OssNotConfigured(RuntimeError):
    """未在环境变量中配置完整 OSS 参数。"""


def oss_storage_ready(settings: Settings | None = None) -> bool:
    """Oss storage ready (``settings``)."""
    s = settings or get_settings()
    return bool(
        (s.aliyun_oss_access_key_id or "").strip()
        and (s.aliyun_oss_access_key_secret or "").strip()
        and (s.aliyun_oss_endpoint or "").strip()
        and (s.aliyun_oss_bucket or "").strip()
    )


def _normalize_endpoint(endpoint: str) -> str:
    """Internal helper: normalize endpoint."""
    e = endpoint.strip().rstrip("/")
    if not e.startswith("http"):
        return f"https://{e}"
    return e


def build_bucket(settings: Settings | None = None) -> oss2.Bucket:
    """构造已鉴权的 Bucket；未配置完整则抛 OssNotConfigured。"""
    s = settings or get_settings()
    if not oss_storage_ready(s):
        raise OssNotConfigured(
            "OSS 未配置：请设置 ALIYUN_OSS_ACCESS_KEY_ID / ALIYUN_OSS_ACCESS_KEY_SECRET / "
            "ALIYUN_OSS_ENDPOINT / ALIYUN_OSS_BUCKET",
        )
    ep = _normalize_endpoint(s.aliyun_oss_endpoint)
    auth = oss2.Auth(
        s.aliyun_oss_access_key_id.strip(),
        s.aliyun_oss_access_key_secret.strip(),
    )
    return oss2.Bucket(auth, ep, (s.aliyun_oss_bucket or "").strip())

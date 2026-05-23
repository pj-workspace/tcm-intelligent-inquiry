"""聊天场景图片上传到 OSS，并生成临时可读签名 URL（供 VL 等服务端拉图）。"""

from __future__ import annotations

import uuid
from io import BytesIO

import oss2
from PIL import Image, UnidentifiedImageError

from app.core.config import Settings, get_settings
from app.storage.aliyun.oss_bucket import build_bucket

ALLOWED_IMAGE_TYPES: frozenset[str] = frozenset(
    {"image/jpeg", "image/png", "image/webp", "image/gif"}
)

# 通义等多模态接口要求宽、高均须大于 10px；此处取 11 作为下限。
MIN_IMAGE_EDGE_PX: int = 11

SUFFIX_BY_TYPE: dict[str, str] = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}


def normalize_content_type(raw: str | None) -> str | None:
    """Normalize content type (``raw``)."""
    if not raw:
        return None
    return raw.split(";")[0].strip().lower()


def sniff_image_type(data: bytes) -> tuple[str | None, str]:
    """根据魔术字节识别类型与后缀。"""
    if len(data) >= 3 and data[:3] == b"\xff\xd8\xff":
        return "image/jpeg", ".jpg"
    if len(data) >= 8 and data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png", ".png"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp", ".webp"
    if len(data) >= 6 and data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif", ".gif"
    return None, ".bin"


def _resolve_ct_and_suffix(data: bytes, content_type_hint: str | None) -> tuple[str, str]:
    """Internal helper: resolve ct and suffix."""
    ct = normalize_content_type(content_type_hint)
    if ct == "image/jpg":
        ct = "image/jpeg"
    if ct in ALLOWED_IMAGE_TYPES:
        return ct, SUFFIX_BY_TYPE[ct]
    sniff_ct, sniff_suf = sniff_image_type(data)
    if sniff_ct in ALLOWED_IMAGE_TYPES:
        return sniff_ct, sniff_suf
    raise ValueError(
        "无法识别为支持的图片（允许 image/jpeg、image/png、image/webp、image/gif），"
        f"Content-Type={content_type_hint!r}",
    )


def assert_image_meets_vl_size_limits(data: bytes) -> None:
    """校验解码后宽高，避免 VL 返回 InvalidParameter（如 height/width 须大于 10）。"""
    try:
        with Image.open(BytesIO(data)) as im:
            im.load()
            w, h = im.size
    except UnidentifiedImageError as e:
        raise ValueError("无法解析图片内容，请更换有效图片文件") from e
    except OSError as e:
        raise ValueError("图片已损坏或格式无法读取，请更换文件后重试") from e
    if w < MIN_IMAGE_EDGE_PX or h < MIN_IMAGE_EDGE_PX:
        raise ValueError(
            f"图片尺寸过小（当前 {w}×{h}）。多模态模型要求宽、高均至少 {MIN_IMAGE_EDGE_PX} 像素，"
            "请使用更大分辨率的图片。"
        )


def upload_chat_image_bytes(
    *,
    owner_user_id: str,
    data: bytes,
    content_type_hint: str | None,
    settings: Settings | None = None,
) -> tuple[str, str, str]:
    """上传对象并返回 (object_key, signed_get_url, content_type)。"""
    if not (owner_user_id or "").strip():
        raise ValueError("owner_user_id 为空")

    s = settings or get_settings()
    max_b = int(s.oss_chat_image_max_bytes)
    if len(data) > max_b:
        raise ValueError(f"图片超过大小限制（最大 {max_b} 字节）")

    ct, suffix = _resolve_ct_and_suffix(data, content_type_hint)
    assert_image_meets_vl_size_limits(data)
    bucket: oss2.Bucket = build_bucket(s)

    prefix = (s.aliyun_oss_chat_prefix or "chat-uploads/").strip()
    if prefix and not prefix.endswith("/"):
        prefix += "/"
    uid_safe = "".join(ch for ch in owner_user_id.strip() if ch.isalnum() or ch in "-_")[:80]
    if not uid_safe:
        uid_safe = "user"
    key = f"{prefix}{uid_safe}/{uuid.uuid4().hex}{suffix}"

    bucket.put_object(key, data, headers={"Content-Type": ct})
    expires = int(s.aliyun_oss_sign_url_expires_seconds)
    url = bucket.sign_url("GET", key, expires, slash_safe=True)
    return key, url, ct

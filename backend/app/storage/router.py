"""存储相关 HTTP 路由（OSS 上传等）。"""

from __future__ import annotations

import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.auth.api.deps import get_current_user
from app.auth.models import UserRecord
from app.core.config import get_settings
from app.core.logging import get_logger
from app.storage.aliyun.chat_image import upload_chat_image_bytes
from app.storage.aliyun.oss_bucket import OssNotConfigured, oss_storage_ready
from app.storage.schemas import OssChatImageUploadResponse

logger = get_logger(__name__)

router = APIRouter(prefix="/api/storage", tags=["storage"])


@router.post(
    "/oss/chat-image",
    response_model=OssChatImageUploadResponse,
    summary="上传聊天图片到 OSS（返回临时可读 URL，供 VL 等使用）",
)
async def upload_oss_chat_image(
    user: Annotated[UserRecord, Depends(get_current_user)],
    file: Annotated[UploadFile, File(description="图片文件")],
) -> OssChatImageUploadResponse:
    """Upload oss chat image。"""
    s = get_settings()
    if not oss_storage_ready(s):
        raise HTTPException(
            status_code=503,
            detail="服务端未配置 OSS，请设置 ALIYUN_OSS_* 环境变量",
        )
    try:
        raw = await file.read()
    except Exception as exc:
        logger.warning("chat-image read failed: %s", exc)
        raise HTTPException(status_code=400, detail="读取上传文件失败") from exc

    max_b = int(s.oss_chat_image_max_bytes)
    if len(raw) > max_b:
        raise HTTPException(
            status_code=413,
            detail=f"文件超过聊天图片上限（最大 {max_b} 字节）",
        )

    try:
        key, signed_url, ct = await asyncio.to_thread(
            upload_chat_image_bytes,
            owner_user_id=str(user.id),
            data=raw,
            content_type_hint=file.content_type or file.headers.get("content-type"),
            settings=s,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except OssNotConfigured:
        raise HTTPException(status_code=503, detail="OSS 未完整配置") from None
    except Exception as exc:
        logger.exception("OSS upload chat-image failed")
        raise HTTPException(status_code=502, detail="OSS 写入失败") from exc

    return OssChatImageUploadResponse(
        object_key=key,
        url=signed_url,
        content_type=ct,
        expires_in_seconds=int(s.aliyun_oss_sign_url_expires_seconds),
    )

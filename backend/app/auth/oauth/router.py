"""OAuth HTTP 路由。

静态路径（/bindings、/exchange）须注册在 `/{provider}/...` 之前，避免 provider=bindings 误匹配。
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.api.deps import get_current_user
from app.auth.models import UserRecord
from app.auth.oauth import service as oauth_svc
from app.auth.oauth.schemas import LoginCodeExchangeIn, ThirdCompleteIn, UnbindVerifyIn
from app.auth.oauth.service import complete_third_flow, exchange_login_code
from app.auth.schemas import TokenResponse
from app.core.database import get_session

router = APIRouter(tags=["oauth"])


def _sess(session: AsyncSession = Depends(get_session)) -> AsyncSession:
    """Internal helper: sess."""
    return session


@router.get("/bindings", summary="已绑定的第三方账号")
async def oauth_bindings(
    user: Annotated[UserRecord, Depends(get_current_user)],
    session: AsyncSession = Depends(_sess),
):
    """Oauth bindings。"""
    return await oauth_svc.list_bindings(session, user.id)


@router.post("/exchange", response_model=TokenResponse, summary="login code 换 JWT")
async def oauth_exchange(
    body: LoginCodeExchangeIn,
    session: AsyncSession = Depends(_sess),
):
    """Oauth exchange。"""
    return await exchange_login_code(session, body.code)


@router.get(
    "/{provider}/authorize",
    summary="获取第三方授权 URL",
)
async def oauth_authorize(provider: str, session: AsyncSession = Depends(_sess)):
    """Oauth authorize (``provider``, ``session``)."""
    try:
        url = await oauth_svc.build_authorize_url(provider)
    except Exception as e:
        from fastapi import HTTPException

        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"authorize_url": url}


@router.get("/{provider}/callback", summary="OAuth 回调（302 回前端）")
async def oauth_callback(
    provider: str,
    session: AsyncSession = Depends(_sess),
    code: str | None = Query(None),
    state: str | None = Query(None),
    error: str | None = Query(None),
    error_description: str | None = Query(None),
):
    """Oauth callback。"""
    err = error
    if err and error_description:
        err = f"{error}:{error_description[:200]}"
    url = await oauth_svc.handle_oauth_callback(
        session,
        provider,
        code,
        state,
        oauth_error=err,
    )
    return RedirectResponse(url=url, status_code=302)


@router.post("/{provider}/complete", summary="thirdFlow 补全邮箱并登录")
async def oauth_complete(
    provider: str,
    body: ThirdCompleteIn,
    session: AsyncSession = Depends(_sess),
):
    """Oauth complete。"""
    _ = provider
    return await complete_third_flow(
        session,
        flow_id=body.flow_id,
        email=body.email,
        code=body.code,
        password=body.password,
        nickname=body.nickname,
    )


@router.post("/{provider}/unbind/code/send", summary="解绑前发邮箱验证码")
async def oauth_unbind_send(
    provider: str,
    user: Annotated[UserRecord, Depends(get_current_user)],
    session: AsyncSession = Depends(_sess),
):
    """Oauth unbind send。"""
    _ = session
    await oauth_svc.send_unbind_code(user.id, user.email, provider)
    return {"ok": True, "message": "验证码已发送"}


@router.post("/{provider}/unbind/verify", summary="校验验证码并解绑")
async def oauth_unbind_verify(
    provider: str,
    body: UnbindVerifyIn,
    user: Annotated[UserRecord, Depends(get_current_user)],
    session: AsyncSession = Depends(_sess),
):
    """Oauth unbind verify。"""
    await oauth_svc.verify_unbind(session, user.id, user.email, provider, body.code)
    return {"ok": True, "message": "解绑成功"}

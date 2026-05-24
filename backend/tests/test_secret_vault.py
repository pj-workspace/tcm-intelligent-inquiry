"""Secret Vault：加密存储、secret:// 引用解析、15 分钟 TTL 常量。"""

from __future__ import annotations

import pytest

from app.chat.secrets.constants import SECRET_VAULT_TTL_SECONDS
from app.chat.secrets.vault import (
    get_secret_plaintext,
    make_secret_ref,
    parse_secret_ref,
    resolve_secret_refs_in_value,
    store_form_secrets,
)


@pytest.mark.asyncio
async def test_vault_ttl_is_15_minutes() -> None:
    assert SECRET_VAULT_TTL_SECONDS == 15 * 60


def test_parse_secret_ref_valid() -> None:
    assert parse_secret_ref("secret://w-abc123/password") == ("w-abc123", "password")
    assert parse_secret_ref("  secret://w-abc123/password  ") == ("w-abc123", "password")
    assert parse_secret_ref("not-a-ref") is None


@pytest.mark.asyncio
async def test_store_and_resolve_secret_ref() -> None:
    conv = "conv-test-1"
    wid = "w-testwidget"
    stored = await store_form_secrets(
        conversation_id=conv,
        widget_id=wid,
        fields={"password": "s3cr3t!", "email": "a@b.com"},
    )
    assert set(stored) == {"password", "email"}

    plain = await get_secret_plaintext(
        conversation_id=conv,
        widget_id=wid,
        field_name="password",
    )
    assert plain == "s3cr3t!"

    ref = make_secret_ref(wid, "email")
    resolved = await resolve_secret_refs_in_value(
        {"user": ref, "items": [ref]},
        conversation_id=conv,
    )
    assert resolved == {"user": "a@b.com", "items": ["a@b.com"]}


@pytest.mark.asyncio
async def test_resolve_missing_ref_raises() -> None:
    with pytest.raises(ValueError, match="已过期或不存在"):
        await resolve_secret_refs_in_value(
            "secret://w-missing/field",
            conversation_id="conv-none",
        )

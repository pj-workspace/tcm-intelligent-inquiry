"""会话敏感字段保险库与 secret:// 引用解析。"""

from app.chat.secrets.constants import SECRET_REF_PREFIX, SECRET_VAULT_TTL_SECONDS
from app.chat.secrets.vault import (
    build_form_resume_hint,
    make_secret_ref,
    mask_secret_refs_for_display,
    resolve_secret_refs_in_value,
    store_form_secrets,
)

__all__ = [
    "SECRET_REF_PREFIX",
    "SECRET_VAULT_TTL_SECONDS",
    "build_form_resume_hint",
    "make_secret_ref",
    "mask_secret_refs_for_display",
    "resolve_secret_refs_in_value",
    "store_form_secrets",
]

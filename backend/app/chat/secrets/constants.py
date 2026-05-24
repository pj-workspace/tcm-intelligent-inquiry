"""敏感表单数据：引用协议与 TTL 常量。"""

from __future__ import annotations

# 表单/Vault 条目有效时间（秒）
SECRET_VAULT_TTL_SECONDS = 15 * 60

# LLM / 工具参数中的引用前缀：secret://{widget_id}/{field_name}
SECRET_REF_PREFIX = "secret://"

# 入库用户消息占位（不含明文）
FORM_SUBMIT_USER_PLACEHOLDER = (
    "【用户已通过表单提交敏感信息；请使用 secret://{widget_id}/<字段名> 引用，勿索要明文】"
)

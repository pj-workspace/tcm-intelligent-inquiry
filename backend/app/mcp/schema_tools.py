"""MCP 工具定义与 JSON Schema → Pydantic 转换。"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, Field, create_model


@dataclass(frozen=True)
class McpToolDef:
    """Mcp Tool Def."""
    name: str
    input_schema: dict[str, Any] | None = None


class McpProxyArgs(BaseModel):
    """回退：无 inputSchema 时由 LLM 传 arguments 字典。"""

    arguments: dict[str, Any] = Field(
        default_factory=dict,
        description="传给 MCP 工具的参数字典；无参数时传 empty object {}。",
    )


def _json_schema_property_type(prop: dict[str, Any]) -> type[Any]:
    """Internal helper: json schema property type."""
    raw = prop.get("type")
    if isinstance(raw, list):
        raw = next((t for t in raw if t != "null"), raw[0] if raw else "string")
    if raw == "integer":
        return int
    if raw == "number":
        return float
    if raw == "boolean":
        return bool
    if raw == "array":
        return list[Any]
    if raw == "object":
        return dict[str, Any]
    return str


def build_mcp_args_schema(
    remote_tool_name: str,
    input_schema: dict[str, Any] | None,
) -> type[BaseModel]:
    """从 MCP inputSchema 生成扁平参数模型；缺失时回退 McpProxyArgs。"""
    if not input_schema or not isinstance(input_schema, dict):
        return McpProxyArgs
    if input_schema.get("type") not in (None, "object"):
        return McpProxyArgs
    props = input_schema.get("properties")
    if not isinstance(props, dict) or not props:
        return McpProxyArgs

    required = set(input_schema.get("required") or [])
    safe_name = "".join(c if c.isalnum() else "_" for c in remote_tool_name) or "tool"
    fields: dict[str, tuple[Any, Any]] = {}

    for prop_name, prop_schema in props.items():
        if not isinstance(prop_name, str) or not prop_name.strip():
            continue
        if not isinstance(prop_schema, dict):
            continue
        py_type = _json_schema_property_type(prop_schema)
        desc = str(prop_schema.get("description") or "")
        if prop_name in required:
            fields[prop_name] = (py_type, Field(..., description=desc))
        else:
            default = prop_schema.get("default", None)
            if py_type is str:
                fields[prop_name] = (
                    str,
                    Field(default="" if default is None else str(default), description=desc),
                )
            else:
                fields[prop_name] = (
                    py_type | None,
                    Field(default=default, description=desc),
                )

    if not fields:
        return McpProxyArgs

    return create_model(f"Mcp_{safe_name}_Args", **fields)


def normalize_mcp_tool_arguments(raw: dict[str, Any] | None) -> dict[str, Any]:
    """兼容 LLM 误包一层 arguments，或 McpProxyArgs 旧格式。"""
    args = dict(raw or {})
    if len(args) == 1 and isinstance(args.get("arguments"), dict):
        inner = dict(args["arguments"])
        if inner and not inner.keys() <= {"arguments"}:
            return inner
    if "arguments" in args and isinstance(args["arguments"], dict):
        merged = dict(args["arguments"])
        for k, v in args.items():
            if k != "arguments":
                merged[k] = v
        return merged
    return args


def _prop_expects_string(prop_schema: dict[str, Any]) -> bool:
    """Internal helper: prop expects string."""
    raw = prop_schema.get("type")
    if raw == "string":
        return True
    if isinstance(raw, list):
        return "string" in raw
    return False


def sanitize_mcp_call_arguments(
    args: dict[str, Any],
    input_schema: dict[str, Any] | None,
) -> dict[str, Any]:
    """去掉 null/空 optional 字段，避免 MCP 服务端 JSON Schema 拒绝 None。"""
    if not isinstance(input_schema, dict):
        return {k: v for k, v in args.items() if v is not None}

    props = input_schema.get("properties")
    if not isinstance(props, dict):
        return {k: v for k, v in args.items() if v is not None}

    required = set(input_schema.get("required") or [])
    out: dict[str, Any] = {}
    for key, value in args.items():
        prop = props.get(key)
        if value is None:
            if key in required and isinstance(prop, dict) and _prop_expects_string(prop):
                out[key] = ""
            continue
        if isinstance(value, str) and not value.strip() and key not in required:
            continue
        out[key] = value

    if (
        "body" in props
        and "html_body" in props
        and isinstance(props.get("body"), dict)
        and isinstance(props.get("html_body"), dict)
    ):
        body_val = out.get("body")
        html_val = out.get("html_body")
        body_text = body_val.strip() if isinstance(body_val, str) else ""
        html_text = html_val.strip() if isinstance(html_val, str) else ""
        if not body_text and html_text:
            out["body"] = html_text

    return out

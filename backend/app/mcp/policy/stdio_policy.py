"""stdio MCP 启动参数校验（仅允许字符串字段，降低注入面）。"""

from __future__ import annotations

from app.core.exceptions import ValidationError


def normalize_stdio_config(raw: dict | None) -> dict[str, object]:
    """Normalize stdio config (``raw``)."""
    if not raw or not isinstance(raw, dict):
        raise ValidationError("stdio 配置无效")
    command = raw.get("command")
    if not isinstance(command, str) or not command.strip():
        raise ValidationError("stdio command 不能为空")
    args_raw = raw.get("args", [])
    if args_raw is None:
        args_raw = []
    if not isinstance(args_raw, list) or not all(isinstance(a, str) for a in args_raw):
        raise ValidationError("stdio args 须为字符串数组")
    env_raw = raw.get("env", {})
    if env_raw is None:
        env_raw = {}
    if not isinstance(env_raw, dict) or not all(
        isinstance(k, str) and isinstance(v, str) for k, v in env_raw.items()
    ):
        raise ValidationError("stdio env 须为字符串键值对")
    cwd = raw.get("cwd")
    if cwd is not None and (not isinstance(cwd, str) or not cwd.strip()):
        raise ValidationError("stdio cwd 须为非空字符串或省略")
    out: dict[str, object] = {
        "command": command.strip(),
        "args": list(args_raw),
        "env": dict(env_raw),
    }
    if isinstance(cwd, str) and cwd.strip():
        out["cwd"] = cwd.strip()
    return out


def parse_cursor_mcp_entry(name: str, conf: object) -> tuple[str, str, str | None, dict | None, dict[str, str]]:
    """解析 Cursor / Claude Desktop 单条 mcpServers 配置。"""
    if not isinstance(conf, dict):
        raise ValidationError(f"MCP「{name}」配置须为对象")
    description = conf.get("description")
    desc = description.strip() if isinstance(description, str) else ""
    headers_raw = conf.get("headers")
    headers: dict[str, str] = {}
    if isinstance(headers_raw, dict):
        headers = {str(k): str(v) for k, v in headers_raw.items()}

    url = conf.get("url")
    if isinstance(url, str) and url.strip():
        return name, "http", url.strip(), None, headers

    command = conf.get("command")
    if isinstance(command, str) and command.strip():
        stdio = normalize_stdio_config(
            {
                "command": command,
                "args": conf.get("args"),
                "env": conf.get("env"),
                "cwd": conf.get("cwd"),
            }
        )
        return name, "stdio", None, stdio, headers

    raise ValidationError(
        f"MCP「{name}」须包含 url（HTTP）或 command（stdio），与 Cursor mcp.json 格式一致"
    )

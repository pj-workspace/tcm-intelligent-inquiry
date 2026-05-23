"""MCP 服务端点 URL 校验：降低 SSRF 风险（禁止常见私网与元数据地址）。"""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse

from app.core.exceptions import ValidationError

_BLOCKED_HOSTNAMES = frozenset(
    {
        "localhost",
        "metadata.google.internal",
        "metadata",
    }
)


def _is_blocked_ip(ip: str) -> bool:
    """Internal helper: is blocked ip."""
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return True
    if addr.is_loopback or addr.is_private or addr.is_link_local or addr.is_reserved:
        return True
    if addr.version == 4:
        # 云元数据常见地址
        if addr == ipaddress.IPv4Address("169.254.169.254"):
            return True
    return False


def assert_mcp_url_allowed(url: str) -> str:
    """校验 MCP URL；通过则返回规范化后的字符串（去尾部斜杠前保留 path）。"""
    raw = (url or "").strip()
    if not raw:
        raise ValidationError("MCP url 不能为空")
    parsed = urlparse(raw)
    if parsed.scheme not in ("http", "https"):
        raise ValidationError("MCP url 仅允许 http 或 https")
    host = (parsed.hostname or "").strip().lower()
    if not host:
        raise ValidationError("MCP url 缺少主机名")
    if host in _BLOCKED_HOSTNAMES:
        raise ValidationError("不允许使用该主机名")
    # 若为字面 IP，直接判断
    try:
        ipaddress.ip_address(host)
        if _is_blocked_ip(host):
            raise ValidationError("不允许访问该网络地址")
        return raw.rstrip("/")
    except ValueError:
        pass

    # 解析域名：任一解析结果为私网/保留则拒绝
    try:
        infos = socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)
    except OSError as exc:
        raise ValidationError(f"无法解析 MCP 主机名: {exc!s}") from exc
    for info in infos:
        ip_str = info[4][0]
        if _is_blocked_ip(ip_str):
            raise ValidationError("MCP 端点解析到不允许的地址，请使用公网可达的服务")
    return raw.rstrip("/")

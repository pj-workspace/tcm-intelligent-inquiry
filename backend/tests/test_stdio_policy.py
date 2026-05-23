"""stdio MCP 配置解析单元测试。"""

import pytest

from app.core.exceptions import ValidationError
from app.mcp.policy.stdio_policy import normalize_stdio_config, parse_cursor_mcp_entry


def test_normalize_stdio_config_ok():
    """Test normalize stdio config ok."""
    cfg = normalize_stdio_config(
        {
            "command": "docker",
            "args": ["compose", "run", "qq-mail-mcp"],
            "env": {"FOO": "bar"},
        }
    )
    assert cfg["command"] == "docker"
    assert cfg["args"] == ["compose", "run", "qq-mail-mcp"]
    assert cfg["env"] == {"FOO": "bar"}


def test_parse_cursor_http_entry():
    """Test parse cursor http entry."""
    name, transport, url, stdio, headers = parse_cursor_mcp_entry(
        "remote",
        {"url": "https://example.com/mcp", "headers": {"Authorization": "Bearer x"}},
    )
    assert name == "remote"
    assert transport == "http"
    assert url == "https://example.com/mcp"
    assert stdio is None
    assert headers["Authorization"] == "Bearer x"


def test_parse_cursor_stdio_entry():
    """Test parse cursor stdio entry."""
    name, transport, url, stdio, _ = parse_cursor_mcp_entry(
        "paper-search-mcp",
        {
            "command": "/Users/jaypan/.local/bin/uv",
            "args": ["run", "-m", "paper_search_mcp.server"],
            "env": {"PAPER_SEARCH_MCP_UNPAYWALL_EMAIL": "a@b.com"},
        },
    )
    assert name == "paper-search-mcp"
    assert transport == "stdio"
    assert url is None
    assert stdio is not None
    assert stdio["command"] == "/Users/jaypan/.local/bin/uv"


def test_parse_cursor_missing_both_raises():
    """Test parse cursor missing both raises."""
    with pytest.raises(ValidationError):
        parse_cursor_mcp_entry("bad", {"description": "x"})

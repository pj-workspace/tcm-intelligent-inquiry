"""MCP API 集成测试（需 PostgreSQL；远端 MCP 用 mock）。"""

from unittest.mock import AsyncMock, patch

import pytest


@pytest.mark.integration
def test_mcp_register_list_delete_roundtrip(client, auth_headers):
    # 使用公网可解析主机名，避免 SSRF 策略拦截；实际连接由 discover_tools_http mock
    with patch(
        "app.mcp.services.mcp_service.discover_tools_http",
        new_callable=AsyncMock,
        return_value=["tool_a"],
    ):
        r = client.post(
            "/api/mcp",
            json={
                "name": "mock_srv",
                "transport": "http",
                "url": "http://example.com:59999/mcp",
                "description": "",
                "enabled": True,
            },
            headers=auth_headers,
        )
    assert r.status_code == 200
    body = r.json()
    sid = body["id"]
    assert body["tool_names"] == ["tool_a"]
    assert body["transport"] == "http"

    listed = client.get("/api/mcp", headers=auth_headers)
    assert listed.status_code == 200
    ids = {x["id"] for x in listed.json()["servers"]}
    assert sid in ids

    r2 = client.delete(f"/api/mcp/{sid}", headers=auth_headers)
    assert r2.status_code == 204

    r3 = client.get(f"/api/mcp/{sid}", headers=auth_headers)
    assert r3.status_code == 404


@pytest.mark.integration
def test_mcp_private_url_rejected(client, auth_headers):
    with patch(
        "app.mcp.services.mcp_service.discover_tools_http",
        new_callable=AsyncMock,
        return_value=["tool_a"],
    ):
        r = client.post(
            "/api/mcp",
            json={
                "name": "bad",
                "transport": "http",
                "url": "http://127.0.0.1:59999/mcp",
                "description": "",
                "enabled": True,
            },
            headers=auth_headers,
        )
    assert r.status_code == 422


@pytest.mark.integration
def test_mcp_stdio_register(client, auth_headers):
    with patch(
        "app.mcp.services.mcp_service.discover_tools_stdio",
        new_callable=AsyncMock,
        return_value=["search_papers"],
    ):
        r = client.post(
            "/api/mcp",
            json={
                "name": "paper-search",
                "transport": "stdio",
                "stdio": {
                    "command": "/usr/bin/uv",
                    "args": ["run", "-m", "paper_search_mcp.server"],
                    "env": {"PAPER_SEARCH_MCP_UNPAYWALL_EMAIL": "test@example.com"},
                },
                "enabled": True,
            },
            headers=auth_headers,
        )
    assert r.status_code == 200
    body = r.json()
    assert body["transport"] == "stdio"
    assert body["url"] is None
    assert body["stdio"]["command"] == "/usr/bin/uv"
    assert body["tool_names"] == ["search_papers"]

    client.delete(f"/api/mcp/{body['id']}", headers=auth_headers)


@pytest.mark.integration
def test_mcp_import_cursor_config(client, auth_headers):
    with patch(
        "app.mcp.services.mcp_service.discover_tools_stdio",
        new_callable=AsyncMock,
        return_value=["tool_x"],
    ), patch(
        "app.mcp.services.mcp_service.discover_tools_http",
        new_callable=AsyncMock,
        return_value=["tool_y"],
    ):
        r = client.post(
            "/api/mcp/import",
            json={
                "mcpServers": {
                    "vision-mcp": {
                        "command": "bash",
                        "args": ["/path/start.sh"],
                    },
                    "remote-http": {
                        "url": "http://example.com:59999/mcp",
                    },
                }
            },
            headers=auth_headers,
        )
    assert r.status_code == 200
    body = r.json()
    assert len(body["imported"]) == 2
    assert body["errors"] == []
    names = {x["name"] for x in body["imported"]}
    assert "vision-mcp" in names
    assert "remote-http" in names

    for item in body["imported"]:
        client.delete(f"/api/mcp/{item['id']}", headers=auth_headers)


@pytest.mark.integration
def test_mcp_requires_auth(client):
    r = client.get("/api/mcp")
    assert r.status_code == 401

"""MCP 删除/刷新时同步 Agent tool_names 的集成测试。"""

from unittest.mock import AsyncMock, patch

import pytest

from app.mcp.schema_tools import McpToolDef


@pytest.mark.integration
def test_mcp_delete_prunes_agent_tool_bindings(client, auth_headers):
    """删除 MCP 后，Agent 中绑定的对应 LangChain 工具名应被移除。"""
    with patch(
        "app.mcp.services.mcp_service.discover_tools_http",
        new_callable=AsyncMock,
        return_value=[McpToolDef(name="send_mail")],
    ):
        mcp_res = client.post(
            "/api/mcp",
            json={
                "name": "mail-mcp",
                "transport": "http",
                "url": "http://example.com:59999/mcp",
                "enabled": True,
            },
            headers=auth_headers,
        )
    assert mcp_res.status_code == 200
    sid = mcp_res.json()["id"]
    sid_prefix = sid.replace("-", "")[:8]

    tools_res = client.get("/api/agents/tools", headers=auth_headers)
    assert tools_res.status_code == 200
    lc_name = next(
        t["name"]
        for t in tools_res.json()["tools"]
        if t.get("mcp_remote_name") == "send_mail"
        and t["name"].startswith(f"mcp_{sid_prefix}_")
    )

    agent_res = client.post(
        "/api/agents",
        json={
            "name": "mail_agent",
            "description": "",
            "system_prompt": "",
            "tool_names": [lc_name],
        },
        headers=auth_headers,
    )
    assert agent_res.status_code == 200
    aid = agent_res.json()["id"]
    assert agent_res.json()["tool_names"] == [lc_name]

    try:
        del_res = client.delete(f"/api/mcp/{sid}", headers=auth_headers)
        assert del_res.status_code == 204

        got = client.get(f"/api/agents/{aid}", headers=auth_headers)
        assert got.status_code == 200
        assert got.json()["tool_names"] == []

        patch_res = client.patch(
            f"/api/agents/{aid}",
            json={"name": "mail_agent"},
            headers=auth_headers,
        )
        assert patch_res.status_code == 200
    finally:
        client.delete(f"/api/agents/{aid}", headers=auth_headers)


@pytest.mark.integration
def test_mcp_refresh_prunes_removed_tool_from_agent(client, auth_headers):
    """刷新 MCP 后远端消失的工具应从 Agent 绑定中移除。"""
    discover = AsyncMock(
        side_effect=[
            [McpToolDef(name="tool_a"), McpToolDef(name="tool_b")],
            [McpToolDef(name="tool_a")],
        ]
    )
    with patch(
        "app.mcp.services.mcp_service.discover_tools_http",
        new=discover,
    ):
        mcp_res = client.post(
            "/api/mcp",
            json={
                "name": "refresh-mcp",
                "transport": "http",
                "url": "http://example.com:59999/mcp",
                "enabled": True,
            },
            headers=auth_headers,
        )
    assert mcp_res.status_code == 200
    sid = mcp_res.json()["id"]
    sid_prefix = sid.replace("-", "")[:8]

    tools_res = client.get("/api/agents/tools", headers=auth_headers)
    tools = tools_res.json()["tools"]
    lc_a = next(
        t["name"]
        for t in tools
        if t.get("mcp_remote_name") == "tool_a"
        and t["name"].startswith(f"mcp_{sid_prefix}_")
    )
    lc_b = next(
        t["name"]
        for t in tools
        if t.get("mcp_remote_name") == "tool_b"
        and t["name"].startswith(f"mcp_{sid_prefix}_")
    )

    agent_res = client.post(
        "/api/agents",
        json={
            "name": "refresh_agent",
            "description": "",
            "system_prompt": "",
            "tool_names": [lc_a, lc_b],
        },
        headers=auth_headers,
    )
    assert agent_res.status_code == 200
    aid = agent_res.json()["id"]

    try:
        with patch(
            "app.mcp.services.mcp_service.discover_tools_http",
            new=discover,
        ):
            refresh_res = client.post(
                f"/api/mcp/{sid}/refresh",
                headers=auth_headers,
            )
        assert refresh_res.status_code == 200

        got = client.get(f"/api/agents/{aid}", headers=auth_headers)
        assert got.status_code == 200
        assert got.json()["tool_names"] == [lc_a]
    finally:
        client.delete(f"/api/agents/{aid}", headers=auth_headers)
        client.delete(f"/api/mcp/{sid}", headers=auth_headers)

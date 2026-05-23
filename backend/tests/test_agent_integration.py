"""Agent API 集成测试（需 PostgreSQL）。"""

import pytest


@pytest.mark.integration
def test_agent_patch(client, auth_headers):
    """Test agent patch."""
    r = client.post(
        "/api/agents",
        json={
            "name": "patch_me",
            "description": "d",
            "system_prompt": "p",
            "tool_names": [],
        },
        headers=auth_headers,
    )
    assert r.status_code == 200
    aid = r.json()["id"]
    try:
        ru = client.patch(
            f"/api/agents/{aid}",
            json={"name": "patched_name"},
            headers=auth_headers,
        )
        assert ru.status_code == 200
        assert ru.json()["name"] == "patched_name"

        empty = client.patch(f"/api/agents/{aid}", json={}, headers=auth_headers)
        assert empty.status_code == 422
    finally:
        client.delete(f"/api/agents/{aid}", headers=auth_headers)


@pytest.mark.integration
def test_agent_delete_persists(client, auth_headers):
    """Test agent delete persists."""
    r = client.post(
        "/api/agents",
        json={
            "name": "to_delete",
            "description": "d",
            "system_prompt": "p",
            "tool_names": [],
        },
        headers=auth_headers,
    )
    assert r.status_code == 200
    aid = r.json()["id"]

    d = client.delete(f"/api/agents/{aid}", headers=auth_headers)
    assert d.status_code == 204

    g = client.get(f"/api/agents/{aid}", headers=auth_headers)
    assert g.status_code == 404

    lst = client.get("/api/agents", headers=auth_headers)
    assert lst.status_code == 200
    assert aid not in {a["id"] for a in lst.json()["agents"]}


@pytest.mark.integration
def test_agent_requires_auth(client):
    """Test agent requires auth."""
    r = client.get("/api/agents")
    assert r.status_code == 401

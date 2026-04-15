"""知识库 API 集成测试（需 PostgreSQL；不调用向量/嵌入）。"""

import uuid

import pytest


@pytest.mark.integration
def test_create_list_get_kb(client, auth_headers):
    name = f"kb_{uuid.uuid4().hex[:8]}"
    r = client.post(
        "/api/knowledge",
        json={"name": name, "description": "test"},
        headers=auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    kb_id = data["id"]
    assert data["name"] == name
    assert "owner_id" in data

    listed = client.get("/api/knowledge", headers=auth_headers)
    assert listed.status_code == 200
    ids = {x["id"] for x in listed.json()["knowledge_bases"]}
    assert kb_id in ids

    one = client.get(f"/api/knowledge/{kb_id}", headers=auth_headers)
    assert one.status_code == 200
    assert one.json()["id"] == kb_id


@pytest.mark.integration
def test_knowledge_requires_auth(client):
    r = client.get("/api/knowledge")
    assert r.status_code == 401


@pytest.mark.integration
def test_ingest_rejects_oversized_file(client, auth_headers, monkeypatch):
    monkeypatch.setenv("MAX_UPLOAD_BYTES", "1024")
    name = f"kb_big_{uuid.uuid4().hex[:8]}"
    kb = client.post(
        "/api/knowledge",
        json={"name": name, "description": "t"},
        headers=auth_headers,
    )
    assert kb.status_code == 200
    kb_id = kb.json()["id"]
    files = {"file": ("big.txt", b"x" * 2048, "text/plain")}
    r = client.post(
        f"/api/knowledge/{kb_id}/ingest",
        files=files,
        headers=auth_headers,
    )
    assert r.status_code == 413


@pytest.mark.integration
def test_kb_not_accessible_to_other_user(client, unique_username):
    """知识库按 owner 隔离：其他用户无法访问详情。"""
    pw = "secret123456"
    u1 = f"{unique_username}_a"
    u2 = f"{unique_username}_b"
    for u in (u1, u2):
        assert client.post(
            "/api/auth/register",
            json={"username": u, "password": pw},
        ).status_code == 200
    t1 = client.post(
        "/api/auth/login",
        json={"username": u1, "password": pw},
    ).json()["access_token"]
    t2 = client.post(
        "/api/auth/login",
        json={"username": u2, "password": pw},
    ).json()["access_token"]
    kb = client.post(
        "/api/knowledge",
        json={"name": f"kb_iso_{uuid.uuid4().hex[:6]}", "description": ""},
        headers={"Authorization": f"Bearer {t1}"},
    )
    assert kb.status_code == 200
    kid = kb.json()["id"]

    other = client.get(
        f"/api/knowledge/{kid}",
        headers={"Authorization": f"Bearer {t2}"},
    )
    assert other.status_code == 404


@pytest.mark.integration
def test_knowledge_requires_api_key_when_configured(client, auth_headers, monkeypatch):
    monkeypatch.setenv("API_KEY", "integration-test-key")
    r = client.get("/api/knowledge", headers=auth_headers)
    assert r.status_code == 401

    r2 = client.get(
        "/api/knowledge",
        headers={**auth_headers, "X-API-Key": "integration-test-key"},
    )
    assert r2.status_code == 200

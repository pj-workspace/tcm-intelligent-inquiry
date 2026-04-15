"""认证 API 集成测试（需 PostgreSQL 与迁移）。"""

import pytest


@pytest.mark.integration
def test_register_login_me(client, unique_username):
    pw = "secret123456"
    r = client.post(
        "/api/auth/register",
        json={"username": unique_username, "password": pw},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["username"] == unique_username
    assert "id" in body

    r2 = client.post(
        "/api/auth/login",
        json={"username": unique_username, "password": pw},
    )
    assert r2.status_code == 200
    token = r2.json()["access_token"]
    assert token

    me = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me.status_code == 200
    assert me.json()["username"] == unique_username


@pytest.mark.integration
def test_login_wrong_password(client, unique_username):
    client.post(
        "/api/auth/register",
        json={"username": unique_username, "password": "secret123456"},
    )
    r = client.post(
        "/api/auth/login",
        json={"username": unique_username, "password": "wrong-password"},
    )
    assert r.status_code == 401

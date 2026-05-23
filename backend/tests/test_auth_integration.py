"""认证 API 集成测试（需 PostgreSQL 与迁移）。"""

import pytest

from tests.register_helpers import prime_email_login_otp, prime_register_otp


@pytest.mark.integration
def test_login_with_email_otp(client, unique_username):
    """Test login with email otp."""
    pw = "secret123456"
    email = f"{unique_username}@test.local"
    prime_register_otp(email)
    assert (
        client.post(
            "/api/auth/register",
            json={
                "username": unique_username,
                "password": pw,
                "email": email,
                "email_code": "887766",
            },
        ).status_code
        == 200
    )
    prime_email_login_otp(email, code="554433")
    r = client.post(
        "/api/auth/login-email-code",
        json={"email": email, "code": "554433"},
    )
    assert r.status_code == 200
    assert r.json().get("access_token")


@pytest.mark.integration
def test_register_login_me(client, unique_username):
    """Test register login me."""
    pw = "secret123456"
    email = f"{unique_username}@test.local"
    prime_register_otp(email)
    r = client.post(
        "/api/auth/register",
        json={
            "username": unique_username,
            "password": pw,
            "email": email,
            "email_code": "887766",
        },
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

    r_mail = client.post(
        "/api/auth/login",
        json={"username": email, "password": pw},
    )
    assert r_mail.status_code == 200

    me = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me.status_code == 200
    assert me.json()["username"] == unique_username


@pytest.mark.integration
def test_login_wrong_password(client, unique_username):
    """Test login wrong password."""
    pw = "secret123456"
    email = f"{unique_username}@test.local"
    prime_register_otp(email)
    client.post(
        "/api/auth/register",
        json={
            "username": unique_username,
            "password": pw,
            "email": email,
            "email_code": "887766",
        },
    )
    r = client.post(
        "/api/auth/login",
        json={"username": unique_username, "password": "wrong-password"},
    )
    assert r.status_code == 401

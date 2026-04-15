"""共享 fixtures：API 客户端、随机测试用户。"""

import uuid

import pytest
from starlette.testclient import TestClient


@pytest.fixture(autouse=True)
def _disable_mcp_background_probe(monkeypatch):
    """避免测试会话中启动 MCP 周期探测后台任务。"""
    monkeypatch.setenv("MCP_PROBE_INTERVAL_SECONDS", "0")


@pytest.fixture(scope="session")
def client():
    """整个测试会话共用一个 TestClient，避免多次 lifespan / 异步引擎绑定到不同事件循环。"""
    from main import app

    with TestClient(app) as c:
        yield c


@pytest.fixture
def unique_username() -> str:
    return f"u_{uuid.uuid4().hex[:12]}"


@pytest.fixture
def auth_headers(client, unique_username) -> dict[str, str]:
    """已登录用户的 Authorization 头（用于需 JWT 的接口）。"""
    pw = "secret123456"
    r = client.post(
        "/api/auth/register",
        json={"username": unique_username, "password": pw},
    )
    assert r.status_code == 200
    r2 = client.post(
        "/api/auth/login",
        json={"username": unique_username, "password": pw},
    )
    assert r2.status_code == 200
    token = r2.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}

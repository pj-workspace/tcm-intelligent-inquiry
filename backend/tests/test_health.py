"""单元/集成测试：health。"""
from fastapi.testclient import TestClient

from main import app


def test_health():
    """Test health."""
    c = TestClient(app)
    r = c.get("/health")
    assert r.status_code == 200
    assert r.json().get("status") == "ok"


def test_health_deps_structure():
    """Test health deps structure."""
    c = TestClient(app)
    r = c.get("/health/deps")
    assert r.status_code == 200
    data = r.json()
    assert "postgres" in data
    assert "redis" in data
    assert "qdrant" in data
    for key in ("postgres", "redis", "qdrant"):
        val = data[key]
        assert isinstance(val, str)
        assert val in ("ok", "fail", "error")


def test_database_url_sync():
    """Test database url sync."""
    from app.core.config import get_settings

    s = get_settings()
    sync_url = s.database_url_sync()
    assert "asyncpg" not in sync_url
    assert "postgresql" in sync_url

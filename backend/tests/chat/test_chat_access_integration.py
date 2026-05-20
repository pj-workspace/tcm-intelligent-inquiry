"""匿名会话访问控制集成测试（需 PostgreSQL）。"""

import uuid

import pytest
from sqlalchemy import create_engine, text

from app.core.config import get_settings


def _sync_seed_conversation(cid: str, secret: str) -> None:
    """使用同步引擎写入，避免与 TestClient 的异步引擎争抢事件循环。"""
    sync_url = get_settings().database_url_sync()
    eng = create_engine(sync_url, pool_pre_ping=True)
    try:
        with eng.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO conversations (id, user_id, title, agent_id, anon_session_secret) "
                    "VALUES (:id, NULL, :title, NULL, :sec)"
                ),
                {"id": cid, "title": "t", "sec": secret},
            )
    finally:
        eng.dispose()


@pytest.mark.integration
def test_anon_conversation_messages_require_secret(client):
    cid = str(uuid.uuid4())
    secret = "a" * 64
    _sync_seed_conversation(cid, secret)

    r = client.get(f"/api/chat/conversations/{cid}/messages")
    assert r.status_code == 403

    r2 = client.get(
        f"/api/chat/conversations/{cid}/messages",
        headers={"X-Anonymous-Session": "wrong" * 8},
    )
    assert r2.status_code == 403

    r3 = client.get(
        f"/api/chat/conversations/{cid}/messages",
        headers={"X-Anonymous-Session": secret},
    )
    assert r3.status_code == 200
    assert r3.json() == []

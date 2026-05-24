"""删除 Agent 时同步会话 agent_id 的集成测试。"""

import uuid

import pytest
from sqlalchemy import create_engine, text

from app.core.config import get_settings


def _sync_seed_conversation(*, cid: str, user_id: str, agent_id: str) -> None:
    sync_url = get_settings().database_url_sync()
    eng = create_engine(sync_url, pool_pre_ping=True)
    try:
        with eng.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO conversations (id, user_id, title, agent_id) "
                    "VALUES (:id, :uid, :title, :aid)"
                ),
                {"id": cid, "uid": user_id, "title": "t", "aid": agent_id},
            )
    finally:
        eng.dispose()


@pytest.mark.integration
def test_delete_agent_resets_conversation_bindings(client, auth_headers):
    """删除 Agent 后，引用它的会话应回落为系统默认（agent_id=null）。"""
    agent_res = client.post(
        "/api/agents",
        json={
            "name": "to_delete_agent",
            "description": "",
            "system_prompt": "",
            "tool_names": [],
        },
        headers=auth_headers,
    )
    assert agent_res.status_code == 200
    aid = agent_res.json()["id"]

    me = client.get("/api/auth/me", headers=auth_headers)
    assert me.status_code == 200
    uid = me.json()["id"]

    cid = str(uuid.uuid4())
    _sync_seed_conversation(cid=cid, user_id=uid, agent_id=aid)

    try:
        listed = client.get("/api/chat/conversations", headers=auth_headers)
        assert listed.status_code == 200
        row = next(c for c in listed.json() if c["id"] == cid)
        assert row["agent_id"] == aid

        del_res = client.delete(f"/api/agents/{aid}", headers=auth_headers)
        assert del_res.status_code == 204

        listed2 = client.get("/api/chat/conversations", headers=auth_headers)
        assert listed2.status_code == 200
        row2 = next(c for c in listed2.json() if c["id"] == cid)
        assert row2["agent_id"] is None
        assert row2["agent_name"] is None
    finally:
        client.delete(f"/api/chat/conversations/{cid}", headers=auth_headers)

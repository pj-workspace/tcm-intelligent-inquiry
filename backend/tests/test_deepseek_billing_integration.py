"""LLM 计费相关：路由校验 + DeepSeek 真实 E2E（需 DEEPSEEK_API_KEY）。"""

from __future__ import annotations

import json
import os

import pytest
from sqlalchemy import create_engine, text

from app.core.config import get_settings
from app.core.deepseek_chat_options import primary_deepseek_chat_model_id


def test_balance_catalog_provider_without_fetcher_returns_501(client, auth_headers):
    """qwen 等为合法 catalog id，但未注册余额 fetcher → 501。"""
    r = client.get("/api/chat/providers/qwen/balance", headers=auth_headers)
    assert r.status_code == 501


def _count_where(table: str, clause: str = "") -> int:
    """Test count where."""
    url = get_settings().database_url_sync()
    eng = create_engine(url)
    sql = f"SELECT COUNT(*) FROM {table}"
    if clause:
        sql += f" WHERE {clause}"
    with eng.connect() as c:
        row = c.execute(text(sql)).scalar()
    return int(row or 0)


@pytest.mark.integration
@pytest.mark.skipif(
    not (os.getenv("DEEPSEEK_API_KEY") or "").strip(),
    reason="需要配置 DEEPSEEK_API_KEY",
)
def test_deepseek_balance_live_inserts_snapshot(client, auth_headers):
    """Test deepseek balance live inserts snapshot."""
    before = _count_where("provider_balance_snapshots", "provider_id = 'deepseek'")
    r = client.get("/api/chat/providers/deepseek/balance", headers=auth_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("provider_id") == "deepseek"
    assert "balances" in body
    after = _count_where("provider_balance_snapshots", "provider_id = 'deepseek'")
    assert after > before


def test_deepseek_unknown_balance_provider_404(client, auth_headers):
    """Test deepseek unknown balance provider 404."""
    r = client.get("/api/chat/providers/not-a-provider/balance", headers=auth_headers)
    assert r.status_code == 404


@pytest.mark.integration
@pytest.mark.skipif(
    not (os.getenv("DEEPSEEK_API_KEY") or "").strip(),
    reason="需要配置 DEEPSEEK_API_KEY",
)
def test_deepseek_chat_sse_llm_usage_live(client, auth_headers):
    """Test deepseek chat sse llm usage live."""
    mid = primary_deepseek_chat_model_id(settings=get_settings())
    before = _count_where("llm_usage_events", "provider_id = 'deepseek'")

    llm_usage = None
    meta_conv = None
    with client.stream(
        "POST",
        "/api/chat",
        headers=auth_headers,
        json={
            "message": "只回复一个字：好",
            "history": [],
            "llm_provider": "deepseek",
            "chat_model": mid,
        },
    ) as resp:
        assert resp.status_code == 200
        for chunk in resp.iter_lines():
            if not chunk:
                continue
            line = chunk.decode("utf-8") if isinstance(chunk, bytes) else chunk
            if not line.startswith("data: "):
                continue
            payload_s = line.removeprefix("data: ").strip()
            if payload_s == "[DONE]":
                break
            try:
                payload = json.loads(payload_s)
            except json.JSONDecodeError:
                continue
            if payload.get("type") == "meta":
                meta_conv = payload.get("conversationId")
            if payload.get("type") == "llm-usage":
                llm_usage = payload
                break

    assert llm_usage is not None, "未收到 llm-usage SSE 事件"
    assert llm_usage.get("provider") == "deepseek"
    assert llm_usage.get("usage")
    assert llm_usage.get("usage_raw") is not None
    assert llm_usage.get("usageEventId")

    after = _count_where("llm_usage_events", "provider_id = 'deepseek'")
    assert after > before

    url = get_settings().database_url_sync()
    eng = create_engine(url)
    eid = str(llm_usage["usageEventId"])
    with eng.connect() as c:
        n = c.execute(
            text("SELECT COUNT(*) FROM llm_usage_events WHERE id = :id"),
            {"id": eid},
        ).scalar()
    assert int(n or 0) == 1
    if meta_conv:
        with eng.connect() as c:
            n2 = c.execute(
                text(
                    "SELECT COUNT(*) FROM llm_usage_events WHERE id = :id AND conversation_id = :cid"
                ),
                {"id": eid, "cid": meta_conv},
            ).scalar()
        assert int(n2 or 0) == 1

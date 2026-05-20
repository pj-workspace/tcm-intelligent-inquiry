"""流式对话与异步入库链路的集成/冒烟测试。"""

import os
import uuid
from unittest.mock import MagicMock, patch

import pytest


@pytest.mark.integration
@pytest.mark.skipif(
    not (os.getenv("DASHSCOPE_API_KEY") or "").strip(),
    reason="需要配置 DASHSCOPE_API_KEY 以调用对话模型",
)
def test_chat_sse_streams_events(client):
    """至少建立 SSE 连接并读到若干事件（依赖真实 LLM）。"""
    lines: list[str] = []
    with client.stream(
        "POST",
        "/api/chat",
        json={"message": "只回复一个字：好", "history": []},
    ) as response:
        assert response.status_code == 200
        assert "text/event-stream" in response.headers.get("content-type", "")
        for chunk in response.iter_lines():
            if chunk:
                lines.append(chunk.decode("utf-8") if isinstance(chunk, bytes) else chunk)
            if len(lines) >= 3:
                break
    assert any("data:" in ln for ln in lines)


@pytest.mark.integration
def test_ingest_async_dispatches_celery_when_enabled(
    client, auth_headers, monkeypatch
):
    monkeypatch.setenv("CELERY_INGEST_ENABLED", "true")
    name = f"kb_cel_{uuid.uuid4().hex[:8]}"
    kb = client.post(
        "/api/knowledge",
        json={"name": name, "description": "t"},
        headers=auth_headers,
    )
    assert kb.status_code == 200
    kb_id = kb.json()["id"]

    mock_delay = MagicMock(return_value=MagicMock(id="fake-celery-task-id"))
    with patch("app.workers.tasks.ingest_document_task") as mock_task:
        mock_task.delay = mock_delay
        files = {"file": ("t.txt", b"hello", "text/plain")}
        r = client.post(
            f"/api/knowledge/{kb_id}/ingest-async",
            files=files,
            headers=auth_headers,
        )
    assert r.status_code == 200
    job = r.json()
    assert job.get("celery_task_id") == "fake-celery-task-id"
    mock_task.delay.assert_called_once()
    pos = mock_task.delay.call_args[0]
    assert pos[1] == kb_id

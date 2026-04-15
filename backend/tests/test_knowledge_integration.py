"""知识库 API 集成测试（需 PostgreSQL；不调用向量/嵌入）。"""

import uuid

import pytest


@pytest.mark.integration
def test_create_list_get_kb(client):
    name = f"kb_{uuid.uuid4().hex[:8]}"
    r = client.post(
        "/api/knowledge",
        json={"name": name, "description": "test"},
    )
    assert r.status_code == 200
    data = r.json()
    kb_id = data["id"]
    assert data["name"] == name

    listed = client.get("/api/knowledge")
    assert listed.status_code == 200
    ids = {x["id"] for x in listed.json()["knowledge_bases"]}
    assert kb_id in ids

    one = client.get(f"/api/knowledge/{kb_id}")
    assert one.status_code == 200
    assert one.json()["id"] == kb_id

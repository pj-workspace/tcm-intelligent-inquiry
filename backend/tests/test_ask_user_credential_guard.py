"""ask_user 对凭证类场景的拦截。"""

from __future__ import annotations

import json

from app.agent.tools.ask_user.plugin import ask_user


def test_ask_user_rejects_credential_choices() -> None:
    out = ask_user.invoke(
        {
            "question": "请输入学号和密码",
            "choices": ["学号：", "密码："],
            "allow_free_text": True,
        }
    )
    payload = json.loads(out)
    assert "error" in payload
    assert "ask_user_form" in payload["error"]


def test_ask_user_allows_normal_symptom_choices() -> None:
    out = ask_user.invoke(
        {
            "question": "头痛性质？",
            "choices": ["胀痛", "刺痛", "隐痛"],
            "allow_free_text": True,
        }
    )
    payload = json.loads(out)
    assert payload.get("__widget__") is True
    assert payload.get("widgetType") == "choice"

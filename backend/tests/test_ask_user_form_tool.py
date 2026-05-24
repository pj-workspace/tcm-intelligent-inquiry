"""ask_user_form 工具输出结构。"""

from __future__ import annotations

import json

from app.agent.tools.ask_user.form_plugin import ask_user_form
from app.agent.tools.ask_user.form_plugin import AskUserFormField


def test_ask_user_form_emits_form_widget() -> None:
    out = ask_user_form.invoke(
        {
            "question": "请填写登录信息",
            "fields": [
                AskUserFormField(name="email", label="邮箱", type="email"),
                AskUserFormField(name="password", label="密码", type="password"),
            ],
        }
    )
    payload = json.loads(out)
    assert payload["__widget__"] is True
    assert payload["widgetType"] == "form"
    assert payload["widgetId"].startswith("w-")
    assert len(payload["fields"]) == 2
    assert payload["fields"][1]["type"] == "password"

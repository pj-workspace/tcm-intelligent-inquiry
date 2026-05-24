"""ChatRequest：表单恢复允许空 message。"""

import pytest
from pydantic import ValidationError

from app.chat.schemas import ChatRequest


def test_chat_request_allows_empty_message_for_form_resume() -> None:
    req = ChatRequest(
        message="",
        conversation_id="conv-1",
        resume_kind="ask_user",
        resume_widget_id="w-abc123",
        form_submission={"student_id": "2021001", "password": "secret"},
    )
    assert req.message == ""
    assert req.form_submission == {"student_id": "2021001", "password": "secret"}


def test_chat_request_rejects_empty_message_without_form() -> None:
    with pytest.raises(ValidationError):
        ChatRequest(message="", conversation_id="conv-1")

"""DeepSeek 余额 JSON 中 is_available 字段解析（避免 Python bool 误伤）。"""

import pytest

from app.llm.providers.deepseek_balance_coerce import balance_is_available_field


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (None, None),
        (True, True),
        (False, False),
        (0, False),
        (1, True),
        (2, None),
        ("true", True),
        ("TRUE", True),
        ("false", False),
        ("0", False),
        ("1", True),
        ("no", False),
        ("yes", True),
        ("off", False),
        ("on", True),
        ("", None),
        ("maybe", None),
        ([], None),
    ],
)
def test_balance_is_available_field(raw, expected):
    """Test balance is available field."""
    assert balance_is_available_field(raw) is expected

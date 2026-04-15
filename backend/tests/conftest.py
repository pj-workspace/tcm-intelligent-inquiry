"""共享 fixtures：API 客户端、随机测试用户。"""

import uuid

import pytest
from starlette.testclient import TestClient


@pytest.fixture(scope="session")
def client():
    """整个测试会话共用一个 TestClient，避免多次 lifespan / 异步引擎绑定到不同事件循环。"""
    from main import app

    with TestClient(app) as c:
        yield c


@pytest.fixture
def unique_username() -> str:
    return f"u_{uuid.uuid4().hex[:12]}"

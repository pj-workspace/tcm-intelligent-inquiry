"""SearXNG 联网工具：格式化单测 + 可选真机 E2E（需容器与 SEARXNG_E2E=1）。"""

import os
from unittest.mock import patch

import pytest

from app.agent.tools._internal.citations import reset_citation_sources
from app.agent.tools.searx_web_search import format_searx_results_for_llm, run_searx_web_search
from app.agent.tools.searx_web_search import plugin as searx_plugin
from app.agent.tools.searx_web_search import run as searx_run


class _FakeResponse403:
    status_code = 403

    def json(self):
        return {}


class _FakeHttpClient:
    def __init__(self, response):
        self._response = response

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def get(self, url, params=None):
        return self._response


def test_format_searx_results_empty():
    assert "空" in format_searx_results_for_llm({"results": []}, 5)


def test_format_searx_results_skips_non_dict():
    reset_citation_sources()
    payload = {
        "results": [
            "bad",
            {"title": "T", "url": "https://a", "content": "C", "engine": "duckduckgo"},
        ]
    }
    out = format_searx_results_for_llm(payload, 5)
    assert "[W1]" in out
    assert "T" in out
    assert "https://a" in out
    assert "duckduckgo" in out


@pytest.mark.asyncio
async def test_run_searx_empty_query():
    out = await run_searx_web_search("   ")
    assert "非空" in out


@pytest.mark.asyncio
async def test_run_searx_disabled_when_url_empty(monkeypatch):
    class _S:
        searxng_url = ""
        searxng_timeout_seconds = 5.0

    monkeypatch.setattr(searx_run, "get_settings", lambda: _S())
    out = await run_searx_web_search("test")
    assert "SEARXNG_URL" in out


@pytest.mark.asyncio
async def test_run_searx_403_message(monkeypatch):
    class _S:
        searxng_url = "http://127.0.0.1:9"
        searxng_timeout_seconds = 5.0

    monkeypatch.setattr(searx_run, "get_settings", lambda: _S())

    with patch.object(searx_run.httpx, "AsyncClient", return_value=_FakeHttpClient(_FakeResponse403())):
        out = await run_searx_web_search("q")
    assert "403" in out
    assert "json" in out


@pytest.mark.asyncio
async def test_searx_tool_registered_and_invokable():
    from unittest.mock import AsyncMock

    from app.agent.tools.loader import ensure_tools_loaded
    from app.agent.tools.registry import tool_registry

    ensure_tools_loaded()
    t = tool_registry.get(["searx_web_search"])[0]
    with patch.object(searx_plugin, "run_searx_web_search", new=AsyncMock(return_value="mocked")):
        got = await t.ainvoke({"query": "x", "max_results": 3})
    assert got == "mocked"


@pytest.mark.searxng
@pytest.mark.asyncio
async def test_live_searx_returns_hits(monkeypatch):
    if os.environ.get("SEARXNG_E2E") != "1":
        pytest.skip("设置 SEARXNG_E2E=1 且 docker compose up -d searxng 后再跑本用例")

    class _S:
        searxng_url = os.environ.get("SEARXNG_URL", "http://127.0.0.1:9888")
        searxng_timeout_seconds = 45.0

    monkeypatch.setattr(searx_run, "get_settings", lambda: _S())
    out = await run_searx_web_search("SearXNG", max_results=3)
    assert "无法连接" not in out
    assert not out.startswith("SearXNG 返回 HTTP")
    assert "[1]" in out
    assert "http" in out.lower()

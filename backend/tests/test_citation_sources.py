"""引用来源 registry 与工具格式化测试。"""

from app.agent.tools._internal.citations import (
    citation_sources_snapshot,
    register_citation_source,
    reset_citation_sources,
)
from app.agent.tools.searx_web_search.formatting import format_searx_results_for_llm


def test_citation_registry_assigns_kind_prefixed_ids():
    reset_citation_sources()

    k = register_citation_source(
        kind="knowledge",
        title="伤寒论片段",
        source="shanghan.pdf",
        snippet="太阳病，桂枝汤主之。",
        score=0.88,
    )
    w = register_citation_source(
        kind="web",
        title="网页标题",
        url="https://example.com/a",
        snippet="摘要",
    )

    assert k["id"] == "K1"
    assert w["id"] == "W1"
    assert citation_sources_snapshot() == [k, w]


def test_searx_formatter_registers_web_sources_with_visible_keys():
    reset_citation_sources()
    text = format_searx_results_for_llm(
        {
            "results": [
                {
                    "title": "桂枝汤资料",
                    "url": "https://example.com/gui-zhi",
                    "content": "桂枝汤用于外感风寒表虚证。",
                    "engine": "baidu",
                }
            ]
        },
        5,
    )

    sources = citation_sources_snapshot()
    assert "[W1]" in text
    assert len(sources) == 1
    assert sources[0]["kind"] == "web"
    assert sources[0]["url"] == "https://example.com/gui-zhi"

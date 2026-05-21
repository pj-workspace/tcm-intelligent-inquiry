"""MCP schema 与 ReAct 图配置测试。"""

from pydantic import BaseModel

from app.agent.react_graph import REACT_AGENT_GRAPH_VERSION
from app.mcp.schema_tools import (
    McpProxyArgs,
    build_mcp_args_schema,
    normalize_mcp_tool_arguments,
    sanitize_mcp_call_arguments,
)


def test_react_agent_uses_v1_for_parallel_tools():
    assert REACT_AGENT_GRAPH_VERSION == "v1"


def test_build_flat_schema_from_mcp_input():
    schema = build_mcp_args_schema(
        "search_pubmed",
        {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "max_results": {"type": "integer"},
            },
            "required": ["query"],
        },
    )
    assert schema is not McpProxyArgs
    assert issubclass(schema, BaseModel)
    inst = schema.model_validate({"query": "tcm", "max_results": 5})
    assert inst.model_dump()["query"] == "tcm"


def test_normalize_nested_arguments():
    assert normalize_mcp_tool_arguments(
        {"arguments": {"query": "x", "max_results": 3}}
    ) == {"query": "x", "max_results": 3}


def test_sanitize_drops_null_optional_strings():
    schema = {
        "type": "object",
        "properties": {
            "to": {"type": "string"},
            "subject": {"type": "string"},
            "body": {"type": "string"},
            "html_body": {"type": "string"},
        },
        "required": ["to", "subject", "body"],
    }
    assert sanitize_mcp_call_arguments(
        {
            "to": "a@b.com",
            "subject": "hi",
            "body": "text",
            "html_body": None,
        },
        schema,
    ) == {"to": "a@b.com", "subject": "hi", "body": "text"}


def test_sanitize_required_null_string_becomes_empty():
    schema = {
        "type": "object",
        "properties": {"body": {"type": "string"}},
        "required": ["body"],
    }
    assert sanitize_mcp_call_arguments({"body": None}, schema) == {"body": ""}


def test_sanitize_body_falls_back_to_html_body():
    schema = {
        "type": "object",
        "properties": {
            "body": {"type": "string"},
            "html_body": {"type": "string"},
        },
        "required": ["body"],
    }
    assert sanitize_mcp_call_arguments(
        {"html_body": "<p>hi</p>"},
        schema,
    ) == {"html_body": "<p>hi</p>", "body": "<p>hi</p>"}

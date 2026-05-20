"""默认/命名 Agent 编译图缓存。"""

from __future__ import annotations

import hashlib
from collections import OrderedDict

from langgraph.graph.state import CompiledStateGraph
from langgraph.prebuilt import create_react_agent

from app.agent.prompts import (
    CHAT_ONLY_SYSTEM_PROMPT,
    DEFAULT_SYSTEM_PROMPT,
    RAW_CHAT_ONLY_SYSTEM_PROMPT,
    RAW_DEFAULT_SYSTEM_PROMPT,
    WEB_SEARCH_TOOL_NAME,
)
from app.agent.tools.loader import ensure_tools_loaded
from app.agent.tools.registry import tool_registry
from app.core.config import (
    get_settings,
    list_qwen_chat_model_option_rows,
    primary_qwen_chat_model,
    qwen_option_for_model_id,
)
from app.core.logging import get_logger
from app.llm.registry import get_chat_model

logger = get_logger(__name__)

_MAX_DEFAULT_GRAPHS = 8
_default_graph_by_fp: dict[str, CompiledStateGraph] = {}

_MAX_NAMED_AGENT_GRAPHS = 16
_named_agent_graphs: OrderedDict[str, CompiledStateGraph] = OrderedDict()


def load_all_tools(*, web_search_enabled: bool = True):
    """加载工具列表；web_search_enabled=False 时剔除联网搜索工具。"""
    ensure_tools_loaded()
    tools = tool_registry.all()
    if not web_search_enabled:
        tools = [t for t in tools if t.name != WEB_SEARCH_TOOL_NAME]
    return tools


def primary_supports_tool_calling_cached() -> bool:
    s = get_settings()
    if (s.llm_provider or "").strip().lower() != "qwen":
        return True
    opts = list_qwen_chat_model_option_rows(s)
    if not opts:
        return True
    row = qwen_option_for_model_id(primary_qwen_chat_model(s), settings=s)
    if row is None:
        return True
    return row.supports_tool_calling


def default_graph_fingerprint() -> str:
    ensure_tools_loaded()
    tool_names = tuple(sorted(tool_registry.names()))
    s = get_settings()
    lp = (s.llm_provider or "qwen").strip().lower()
    opts = list_qwen_chat_model_option_rows(s)

    if lp == "qwen" and opts:
        pid = primary_qwen_chat_model(s)
        tc = primary_supports_tool_calling_cached()
        raw_sign = RAW_DEFAULT_SYSTEM_PROMPT if tc else RAW_CHAT_ONLY_SYSTEM_PROMPT
        ph = hashlib.sha256(raw_sign.encode("utf-8")).hexdigest()[:16]
        blob = repr(
            (
                "qwen_opts_v3",
                pid,
                "with_tools" if tc else "chat_only",
                ph,
                s.dashscope_api_key,
                s.dashscope_base_url,
                tool_names,
            )
        )
        return hashlib.sha256(blob.encode("utf-8")).hexdigest()

    blob = repr(
        (
            s.llm_provider,
            s.qwen_chat_model,
            s.dashscope_api_key,
            s.dashscope_base_url,
            s.openai_api_key,
            s.openai_base_url,
            s.openai_chat_model,
            s.anthropic_api_key,
            s.anthropic_chat_model,
            s.zhipu_api_key,
            s.glm_base_url,
            s.glm_chat_model,
            s.deepseek_api_key,
            s.deepseek_base_url,
            s.deepseek_chat_model,
            tool_names,
            hashlib.sha256(RAW_DEFAULT_SYSTEM_PROMPT.encode("utf-8")).hexdigest()[:16],
        )
    )
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def get_default_graph() -> CompiledStateGraph:
    fp = default_graph_fingerprint()
    cached = _default_graph_by_fp.get(fp)
    if cached is not None:
        return cached
    llm = get_chat_model()
    primary_tc = primary_supports_tool_calling_cached()
    if primary_tc:
        tools = load_all_tools(web_search_enabled=False)
        prompt = DEFAULT_SYSTEM_PROMPT
    else:
        tools = []
        prompt = CHAT_ONLY_SYSTEM_PROMPT
    logger.info(
        "创建默认 ReAct Agent（primary_tools=%s），工具: %s",
        primary_tc,
        [t.name for t in tools],
    )
    graph = create_react_agent(llm, tools, prompt=prompt)
    _default_graph_by_fp[fp] = graph
    while len(_default_graph_by_fp) > _MAX_DEFAULT_GRAPHS:
        _default_graph_by_fp.pop(next(iter(_default_graph_by_fp)))
    return graph


def invalidate_default_graph_cache() -> None:
    _default_graph_by_fp.clear()
    _named_agent_graphs.clear()


def invalidate_agent_graph_cache(agent_id: str | None = None) -> None:
    if agent_id:
        _named_agent_graphs.pop(agent_id, None)
    else:
        _named_agent_graphs.clear()


def get_named_agent_graph(agent_id: str) -> CompiledStateGraph | None:
    g = _named_agent_graphs.get(agent_id)
    if g is not None:
        _named_agent_graphs.move_to_end(agent_id)
    return g


def set_named_agent_graph(agent_id: str, graph: CompiledStateGraph) -> None:
    _named_agent_graphs[agent_id] = graph
    _named_agent_graphs.move_to_end(agent_id)
    while len(_named_agent_graphs) > _MAX_NAMED_AGENT_GRAPHS:
        _named_agent_graphs.popitem(last=False)

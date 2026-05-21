"""Agent 运行时：基于 LangGraph create_react_agent 构建 ReAct 图。"""

from __future__ import annotations

from typing import Literal

from langgraph.graph.state import CompiledStateGraph
from app.agent.react_graph import build_react_agent_graph

from app.agent.graph_cache import (
    get_default_graph,
    get_named_agent_graph,
    invalidate_agent_graph_cache,
    invalidate_default_graph_cache,
    load_all_tools,
    primary_supports_tool_calling_cached,
    set_named_agent_graph,
)
from app.agent.prompts import (
    CHAT_ONLY_SYSTEM_PROMPT,
    DEFAULT_SYSTEM_PROMPT,
    RAW_CHAT_ONLY_SYSTEM_PROMPT,
    RAW_DEFAULT_SYSTEM_PROMPT,
    WEB_SEARCH_TOOL_NAME,
    dynamic_prompt_suffix,
)
from app.agent.tools._internal.mark_summary import mark_summary_tool
from app.agent.tools.loader import ensure_tools_loaded
from app.agent.tools.registry import tool_registry
from app.core.config import get_settings, primary_qwen_chat_model
from app.core.database import async_session_factory
from app.core.logging import get_logger
from app.core.safety import append_tcm_safety_to_system_prompt
from app.llm.registry import get_chat_model

logger = get_logger(__name__)

__all__ = [
    "build_agent_graph",
    "build_agent_graph_for_chat_request",
    "invalidate_agent_graph_cache",
    "invalidate_default_graph_cache",
]


async def build_agent_graph(agent_id: str | None) -> CompiledStateGraph:
    """构建 LangGraph Agent；无 agent_id 时返回缓存的默认图。"""
    primary_tc = primary_supports_tool_calling_cached()

    if not agent_id:
        return get_default_graph()

    cached = get_named_agent_graph(agent_id)
    if cached is not None:
        return cached

    from app.agent.models import AgentRecord

    async with async_session_factory() as session:
        row = await session.get(AgentRecord, agent_id)
        if row is None:
            logger.warning("Agent id=%s 不存在，回退默认 Agent", agent_id)
            return get_default_graph()

        llm = get_chat_model()
        if primary_tc:
            ensure_tools_loaded()
            names = row.tool_names or []
            if names:
                tools = tool_registry.get(names)
                if len(tools) != len(names):
                    found = {t.name for t in tools}
                    missing = [n for n in names if n not in found]
                    logger.warning("Agent 工具部分缺失，已忽略: %s", missing)
            else:
                tools = tool_registry.all()

            if not tools:
                tools = tool_registry.all()

            base = (row.system_prompt or "").strip() or RAW_DEFAULT_SYSTEM_PROMPT
            prompt = append_tcm_safety_to_system_prompt(base)
            logger.info(
                "创建 Agent id=%s name=%s tools=%s",
                row.id,
                row.name,
                [t.name for t in tools],
            )
            graph = build_react_agent_graph(llm, tools, prompt=prompt)
        else:
            tools = []
            prompt = CHAT_ONLY_SYSTEM_PROMPT
            logger.info(
                "创建 Agent id=%s name=%s（primary 关闭工具挂载，仅用纯聊提示）tools=[]",
                row.id,
                row.name,
            )
            graph = build_react_agent_graph(llm, tools, prompt=prompt)

        set_named_agent_graph(agent_id, graph)
        return graph


def _with_mark_summary(
    tools: list,
    *,
    effective_deep_think: bool,
) -> list:
    """Think + 有工具时，追加 ``mark_summary`` 内部信号工具到 tools 列表末尾。

    - 非 think 模式 → 原样返回（模型物理上无法看到此工具）
    - 纯聊（``tools=[]``）→ 原样返回（不挂任何工具，包括 mark_summary）
    - 已含 mark_summary → 防御性跳过避免重复
    """
    if not effective_deep_think:
        return tools
    if not tools:
        return tools
    if any(getattr(t, "name", None) == "mark_summary" for t in tools):
        return tools
    return [*tools, mark_summary_tool]


async def _build_ephemeral_agent_graph(
    agent_id: str | None,
    suffix: str,
    *,
    effective_deep_think: bool = False,
    effective_web_search: bool = False,
    chat_model_override: str,
    effective_tool_calling: bool,
    llm_provider: str | None = None,
) -> CompiledStateGraph:
    mid = chat_model_override.strip()
    extra = suffix.strip()

    if not agent_id:
        if not effective_tool_calling:
            tools: list = []
            raw = RAW_CHAT_ONLY_SYSTEM_PROMPT + ("\n\n" + extra if extra else "")
            prompt = append_tcm_safety_to_system_prompt(raw)
            llm = get_chat_model(
                enable_thinking=effective_deep_think,
                chat_model_override=mid,
                llm_provider=llm_provider,
            )
            logger.info(
                "临时 ReAct Agent（默认、纯聊、thinking=%s）tools=[]",
                effective_deep_think,
            )
        else:
            tools = load_all_tools(web_search_enabled=effective_web_search)
            raw = RAW_DEFAULT_SYSTEM_PROMPT + ("\n\n" + extra if extra else "")
            prompt = append_tcm_safety_to_system_prompt(raw)
            llm = get_chat_model(
                enable_thinking=effective_deep_think,
                chat_model_override=mid,
                llm_provider=llm_provider,
            )
            logger.info(
                "临时 ReAct Agent（默认），thinking=%s web=%s tools=%s",
                effective_deep_think,
                effective_web_search,
                [t.name for t in tools],
            )
        return build_react_agent_graph(
            llm,
            _with_mark_summary(tools, effective_deep_think=effective_deep_think),
            prompt=prompt,
        )

    from app.agent.models import AgentRecord

    async with async_session_factory() as session:
        row = await session.get(AgentRecord, agent_id)
        if row is None:
            if not effective_tool_calling:
                tools = []
                raw = RAW_CHAT_ONLY_SYSTEM_PROMPT + ("\n\n" + extra if extra else "")
                prompt = append_tcm_safety_to_system_prompt(raw)
                logger.warning(
                    "Agent id=%s 不存在，临时纯聊兜底 tools=[]",
                    agent_id,
                )
            else:
                tools = load_all_tools(web_search_enabled=effective_web_search)
                raw = RAW_DEFAULT_SYSTEM_PROMPT + ("\n\n" + extra if extra else "")
                prompt = append_tcm_safety_to_system_prompt(raw)
                logger.warning(
                    "Agent id=%s 不存在，使用默认提示 + 动态后缀；tools=%s",
                    agent_id,
                    [t.name for t in tools],
                )
            llm = get_chat_model(
                enable_thinking=effective_deep_think,
                chat_model_override=mid,
                llm_provider=llm_provider,
            )
            return build_react_agent_graph(
                llm,
                _with_mark_summary(tools, effective_deep_think=effective_deep_think),
                prompt=prompt,
            )

        if not effective_tool_calling:
            tools = []
            raw = RAW_CHAT_ONLY_SYSTEM_PROMPT + ("\n\n" + extra if extra else "")
            prompt = append_tcm_safety_to_system_prompt(raw)
            llm = get_chat_model(
                enable_thinking=effective_deep_think,
                chat_model_override=mid,
                llm_provider=llm_provider,
            )
            logger.info(
                "临时 Agent id=%s name=%s 纯聊 tools=[] thinking=%s",
                row.id,
                row.name,
                effective_deep_think,
            )
            return build_react_agent_graph(llm, tools, prompt=prompt)
            # 纯聊路径 tools=[]，故 _with_mark_summary 也会原样返回，无需再包

        ensure_tools_loaded()
        names = row.tool_names or []
        if names:
            tools = tool_registry.get(names)
            if len(tools) != len(names):
                found = {t.name for t in tools}
                missing = [n for n in names if n not in found]
                logger.warning("Agent 工具部分缺失，已忽略: %s", missing)
        else:
            tools = tool_registry.all()
        if not tools:
            tools = tool_registry.all()
        if not effective_web_search:
            tools = [t for t in tools if t.name != WEB_SEARCH_TOOL_NAME]

        base = (row.system_prompt or "").strip() or RAW_DEFAULT_SYSTEM_PROMPT
        raw = base + ("\n\n" + extra if extra else "")
        prompt = append_tcm_safety_to_system_prompt(raw)
        llm = get_chat_model(
            enable_thinking=effective_deep_think,
            chat_model_override=mid,
            llm_provider=llm_provider,
        )
        logger.info(
            "临时 Agent id=%s name=%s tools=%s thinking=%s web=%s model=%s",
            row.id,
            row.name,
            [t.name for t in tools],
            effective_deep_think,
            effective_web_search,
            mid,
        )
        return build_react_agent_graph(
            llm,
            _with_mark_summary(tools, effective_deep_think=effective_deep_think),
            prompt=prompt,
        )


async def build_agent_graph_for_chat_request(
    agent_id: str | None,
    *,
    llm_provider_effective: str,
    chat_model_override: str,
    effective_deep_think: bool,
    effective_web_search: bool,
    web_search_mode: Literal["auto", "force"] = "force",
    effective_tool_calling: bool,
) -> CompiledStateGraph:
    s = get_settings()
    lp_eff = (llm_provider_effective or "qwen").strip().lower()
    lp_settings = (s.llm_provider or "qwen").strip().lower()

    suffix = dynamic_prompt_suffix(
        effective_deep_think,
        effective_web_search,
        web_search_mode,
    )

    if lp_eff != lp_settings:
        return await _build_ephemeral_agent_graph(
            agent_id,
            suffix,
            effective_deep_think=effective_deep_think,
            effective_web_search=effective_web_search,
            chat_model_override=chat_model_override,
            effective_tool_calling=effective_tool_calling,
            llm_provider=lp_eff,
        )

    if lp_eff != "qwen":
        deepseek_override_differs = False
        if lp_eff == "deepseek":
            from app.core.deepseek_chat_options import primary_deepseek_chat_model_id

            pid = primary_deepseek_chat_model_id(settings=s)
            ov = (chat_model_override or "").strip()
            deepseek_override_differs = bool(ov and ov != pid)

        if not suffix and not effective_deep_think and not deepseek_override_differs:
            return await build_agent_graph(agent_id)
        return await _build_ephemeral_agent_graph(
            agent_id,
            suffix,
            effective_deep_think=effective_deep_think,
            effective_web_search=effective_web_search,
            chat_model_override=chat_model_override,
            effective_tool_calling=effective_tool_calling,
            llm_provider=None,
        )

    primary_mid = primary_qwen_chat_model(s)
    primary_tc = primary_supports_tool_calling_cached()

    hits_cache = (
        (chat_model_override or "").strip() == primary_mid.strip()
        and not suffix
        and effective_tool_calling == primary_tc
    )

    if hits_cache:
        return await build_agent_graph(agent_id)

    return await _build_ephemeral_agent_graph(
        agent_id,
        suffix,
        effective_deep_think=effective_deep_think,
        effective_web_search=effective_web_search,
        chat_model_override=chat_model_override,
        effective_tool_calling=effective_tool_calling,
        llm_provider=None,
    )

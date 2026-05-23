"""Agent 管理服务：配置持久化到 PostgreSQL。"""

import re
import time
import uuid
from typing import Any

from langchain_core.tools import BaseTool
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.models import AgentRecord
from app.knowledge.models import KnowledgeBaseRecord
from app.agent.schemas import (
    AgentCreateRequest,
    AgentListResponse,
    AgentResponse,
    AgentUpdateRequest,
    BuiltinToolInfo,
    ToolArgInfo,
    ToolInvokeResponse,
    ToolListResponse,
)
from app.agent.tools.loader import ensure_tools_loaded
from app.agent.tools.registry import tool_registry
from app.agent.executor import invalidate_agent_graph_cache
from app.core.exceptions import NotFoundError, ValidationError
from app.core.logging import get_logger
from app.mcp.bridge.tool_bridge import get_mcp_tool_metadata

logger = get_logger(__name__)

# ── 工具静态元数据 ─────────────────────────────────────────────────────────────
_TOOL_META: dict[str, dict[str, str]] = {
    "search_tcm_knowledge": {"label": "知识库检索", "category": "knowledge"},
    "formula_lookup":       {"label": "方剂查询",   "category": "formula"},
    "recommend_formulas":   {"label": "方剂推荐",   "category": "formula"},
    "searx_web_search":     {"label": "联网搜索",   "category": "web"},
}


def _parse_docstring_arg_descs(docstring: str) -> dict[str, str]:
    """从 docstring 提取 `- arg_name: desc` 格式的参数说明。"""
    result: dict[str, str] = {}
    in_params = False
    for line in docstring.splitlines():
        stripped = line.strip()
        if stripped in ("参数：", "参数:", "Args:", "Arguments:"):
            in_params = True
            continue
        if in_params:
            m = re.match(r"^-\s+(\w+)\s*:\s*(.+)$", stripped)
            if m:
                result[m.group(1)] = m.group(2).strip()
            elif stripped and not stripped.startswith("-"):
                in_params = False
    return result


def _parse_tool_args(tool: BaseTool) -> list[ToolArgInfo]:
    """从 LangChain 工具的 JSON schema 与 docstring 解析参数元数据。"""
    if tool.args_schema is None:
        return []
    try:
        schema = tool.args_schema.model_json_schema()
    except Exception:
        return []
    props = schema.get("properties", {})
    required_set = set(schema.get("required", []))
    arg_descs = _parse_docstring_arg_descs(tool.description or "")
    args: list[ToolArgInfo] = []
    for name, info in props.items():
        t = info.get("type", "string")
        if "anyOf" in info:
            non_null = [x.get("type") for x in info["anyOf"] if x.get("type") != "null"]
            t = non_null[0] if non_null else "string"
        args.append(ToolArgInfo(
            name=name,
            type=t or "string",
            required=name in required_set,
            default=info.get("default"),
            description=arg_descs.get(name, ""),
        ))
    return args


def _to_response(row: AgentRecord) -> AgentResponse:
    """将 ORM 行映射为 API 响应模型。"""
    names = row.tool_names if isinstance(row.tool_names, list) else []
    return AgentResponse(
        id=row.id,
        name=row.name,
        description=row.description or "",
        tool_names=[str(x) for x in names],
        system_prompt=row.system_prompt or "",
        default_kb_id=getattr(row, "default_kb_id", None),
    )


async def _ensure_kb_owned_by_user(session: AsyncSession, kb_id: str, user_id: str) -> None:
    """校验知识库存在且归属当前用户，否则抛出 ValidationError。"""
    row = await session.get(KnowledgeBaseRecord, kb_id)
    if row is None or row.owner_id != user_id:
        raise ValidationError("知识库不存在或不属于当前用户，无法绑定为默认知识库。")


class AgentService:
    """Agent 配置的 CRUD 与工具元数据查询。"""

    def __init__(self, session: AsyncSession):
        """绑定异步数据库会话。"""
        self._session = session

    async def list_agents(self) -> AgentListResponse:
        """列出全部 Agent，按名称排序。"""
        r = await self._session.execute(select(AgentRecord).order_by(AgentRecord.name))
        rows = r.scalars().all()
        return AgentListResponse(agents=[_to_response(x) for x in rows], total=len(rows))

    async def get_agent(self, agent_id: str) -> AgentResponse:
        """按 ID 获取 Agent；不存在时抛出 NotFoundError。"""
        row = await self._session.get(AgentRecord, agent_id)
        if row is None:
            raise NotFoundError(f"Agent '{agent_id}' 不存在")
        return _to_response(row)

    async def create_agent(self, req: AgentCreateRequest, user_id: str) -> AgentResponse:
        """创建 Agent 并校验工具名与默认知识库归属。"""
        ensure_tools_loaded()
        available = set(tool_registry.names())
        names = req.tool_names or []
        if names:
            unknown = [n for n in names if n not in available]
            if unknown:
                raise ValidationError(f"未知工具: {unknown}，可用工具: {sorted(available)}")

        dk: str | None = None
        if req.default_kb_id and str(req.default_kb_id).strip():
            dk = str(req.default_kb_id).strip()
            await _ensure_kb_owned_by_user(self._session, dk, user_id)

        agent_id = str(uuid.uuid4())
        tool_list = names if names else sorted(available)
        row = AgentRecord(
            id=agent_id,
            name=req.name,
            description=req.description or "",
            tool_names=tool_list,
            system_prompt=req.system_prompt or "",
            default_kb_id=dk,
        )
        self._session.add(row)
        await self._session.flush()
        logger.info("创建 Agent id=%s name=%s tools=%s", agent_id, req.name, tool_list)
        return _to_response(row)

    async def update_agent(self, agent_id: str, req: AgentUpdateRequest, user_id: str) -> AgentResponse:
        """部分更新 Agent 配置；更新后使对应编译图缓存失效。"""
        row = await self._session.get(AgentRecord, agent_id)
        if row is None:
            raise NotFoundError(f"Agent '{agent_id}' 不存在")
        patch = req.model_dump(exclude_unset=True)
        if not patch:
            raise ValidationError("至少提供一个要更新的字段")
        if "default_kb_id" in patch:
            kid = patch["default_kb_id"]
            if kid is None or (isinstance(kid, str) and not kid.strip()):
                row.default_kb_id = None
            else:
                dk = str(kid).strip()
                await _ensure_kb_owned_by_user(self._session, dk, user_id)
                row.default_kb_id = dk
        if "tool_names" in patch:
            ensure_tools_loaded()
            available = set(tool_registry.names())
            names = patch["tool_names"] or []
            if names:
                unknown = [n for n in names if n not in available]
                if unknown:
                    raise ValidationError(
                        f"未知工具: {unknown}，可用工具: {sorted(available)}"
                    )
            row.tool_names = names if names else sorted(available)
        if "name" in patch and patch["name"] is not None:
            row.name = patch["name"]
        if "description" in patch:
            row.description = patch["description"] or ""
        if "system_prompt" in patch:
            row.system_prompt = patch["system_prompt"] or ""
        await self._session.flush()
        invalidate_agent_graph_cache(agent_id)
        logger.info("更新 Agent id=%s fields=%s", agent_id, list(patch.keys()))
        return _to_response(row)

    async def delete_agent(self, agent_id: str) -> None:
        """删除 Agent 并清除其编译图缓存。"""
        row = await self._session.get(AgentRecord, agent_id)
        if row is None:
            raise NotFoundError(f"Agent '{agent_id}' 不存在")
        await self._session.delete(row)
        invalidate_agent_graph_cache(agent_id)
        logger.info("删除 Agent id=%s", agent_id)

    async def list_available_tools(self) -> ToolListResponse:
        """列出注册表内全部工具的结构化元数据及被引用次数。"""
        ensure_tools_loaded()
        r = await self._session.execute(select(AgentRecord))
        agents = r.scalars().all()

        infos: list[BuiltinToolInfo] = []
        for tool in tool_registry.all():
            mcp_meta = get_mcp_tool_metadata(tool.name)
            if mcp_meta:
                remote = mcp_meta.get("remote_tool_name") or tool.name
                server = mcp_meta.get("server_display_name") or "MCP"
                used = sum(1 for a in agents if tool.name in (a.tool_names or []))
                infos.append(BuiltinToolInfo(
                    name=tool.name,
                    label=remote,
                    description=(tool.description or "").strip(),
                    category="mcp",
                    source="mcp",
                    mcp_server=server,
                    mcp_remote_name=remote,
                    args_schema=_parse_tool_args(tool),
                    used_by_agents=used,
                ))
                continue
            meta = _TOOL_META.get(tool.name, {"label": tool.name, "category": "system"})
            used = sum(1 for a in agents if tool.name in (a.tool_names or []))
            infos.append(BuiltinToolInfo(
                name=tool.name,
                label=meta["label"],
                description=(tool.description or "").strip(),
                category=meta["category"],
                source="builtin",
                args_schema=_parse_tool_args(tool),
                used_by_agents=used,
            ))
        return ToolListResponse(tools=infos)

    async def invoke_tool(
        self,
        tool_name: str,
        args: dict[str, Any],
        user_id: str,
    ) -> ToolInvokeResponse:
        """在线试运行指定工具，并在请求上下文中注入用户 ID。"""
        ensure_tools_loaded()
        tool = tool_registry._tools.get(tool_name)
        if tool is None:
            raise NotFoundError(f"工具 '{tool_name}' 不存在")

        from app.core.chat_context import chat_user_id  # avoid circular at module level
        ctx_token = chat_user_id.set(user_id)
        start = time.monotonic()
        try:
            # ainvoke 是 LangChain 推荐的结构化调用方式，支持 dict 参数
            result = await tool.ainvoke(args if args else {})
        except Exception as exc:
            result = f"执行出错：{exc}"
        finally:
            chat_user_id.reset(ctx_token)

        return ToolInvokeResponse(
            result=str(result),
            elapsed_ms=int((time.monotonic() - start) * 1000),
        )

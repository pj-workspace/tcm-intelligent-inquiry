"""Agent 管理 API 的请求/响应模型。"""

from typing import Any

from pydantic import BaseModel, Field


class AgentCreateRequest(BaseModel):
    """创建 Agent 的请求体。"""

    name: str = Field(..., min_length=1, description="Agent 名称")
    description: str = Field(default="", description="Agent 用途说明")
    system_prompt: str = Field(default="", description="自定义系统提示（空则使用默认）")
    tool_names: list[str] = Field(default_factory=list, description="启用的工具名列表")
    default_kb_id: str | None = Field(
        default=None, description="默认知识库 ID（search_tcm_knowledge 未传 kb_id 时使用）"
    )


class AgentUpdateRequest(BaseModel):
    """部分更新：至少提供一项；未出现的字段保持不变。"""

    name: str | None = Field(default=None, min_length=1, description="Agent 名称")
    description: str | None = None
    system_prompt: str | None = None
    tool_names: list[str] | None = None
    default_kb_id: str | None = None


class AgentResponse(BaseModel):
    """单个 Agent 的 API 响应。"""

    id: str
    name: str
    description: str
    tool_names: list[str]
    system_prompt: str = ""
    default_kb_id: str | None = None


class AgentListResponse(BaseModel):
    """Agent 列表分页响应。"""

    agents: list[AgentResponse]
    total: int


# ── 内置工具元数据 ────────────────────────────────────────────────────────────

class ToolArgInfo(BaseModel):
    """内置工具单个参数的元数据。"""

    name: str
    type: str
    required: bool
    default: Any | None = None
    description: str = ""


class BuiltinToolInfo(BaseModel):
    """内置或 MCP 工具的展示与 schema 信息。"""

    name: str
    label: str
    description: str
    category: str
    source: str = Field(default="builtin", description="builtin | mcp")
    mcp_server: str | None = Field(default=None, description="MCP 服务展示名")
    mcp_remote_name: str | None = Field(default=None, description="MCP 远端工具名")
    args_schema: list[ToolArgInfo]
    used_by_agents: int


class ToolListResponse(BaseModel):
    """可用工具列表响应。"""

    tools: list[BuiltinToolInfo]


class ToolInvokeRequest(BaseModel):
    """在线试用工具时的参数载荷。"""

    args: dict[str, Any] = Field(default_factory=dict)


class ToolInvokeResponse(BaseModel):
    """工具试运行的文本结果与耗时。"""

    result: str
    elapsed_ms: int


class GenerateSystemPromptRequest(BaseModel):
    """AI 生成 Agent system prompt 的请求体。"""

    name: str = Field(..., min_length=1, max_length=255, description="Agent 名称")
    description: str = Field(default="", max_length=2000, description="Agent 用途说明")
    default_kb_id: str | None = Field(default=None, description="默认知识库 ID（可选）")
    user_requirements: str | None = Field(
        default=None,
        max_length=2000,
        description="用户补充需求（语气、场景等）",
    )


class GenerateSystemPromptResponse(BaseModel):
    """AI 生成结果：XML system prompt + 推荐工具。"""

    system_prompt: str
    suggested_tool_names: list[str]
    reasoning: str | None = None

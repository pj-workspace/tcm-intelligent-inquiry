"""Agent 管理 API 的请求/响应模型。"""

from pydantic import BaseModel, Field


class AgentCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, description="Agent 名称")
    description: str = Field(default="", description="Agent 用途说明")
    system_prompt: str = Field(default="", description="自定义系统提示（空则使用默认）")
    tool_names: list[str] = Field(default_factory=list, description="启用的工具名列表")


class AgentResponse(BaseModel):
    id: str
    name: str
    description: str
    tool_names: list[str]
    system_prompt: str = ""


class AgentListResponse(BaseModel):
    agents: list[AgentResponse]
    total: int

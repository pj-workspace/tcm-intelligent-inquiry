"""MCP（Model Context Protocol）集成 API 的请求/响应模型。"""

from typing import Literal

from pydantic import BaseModel, Field, model_validator


class McpStdioConfig(BaseModel):
    command: str = Field(..., min_length=1, description="可执行文件路径（如 docker、uv、bash）")
    args: list[str] = Field(default_factory=list, description="命令行参数")
    env: dict[str, str] = Field(default_factory=dict, description="附加环境变量")
    cwd: str | None = Field(default=None, description="工作目录（可选）")


class McpServerCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, description="MCP 服务名称")
    transport: Literal["http", "stdio"] = Field(
        default="http",
        description="http：Streamable HTTP/SSE；stdio：本地子进程（Cursor mcp.json command 格式）",
    )
    url: str | None = Field(
        default=None,
        description="HTTP 传输时的 MCP 端点 URL（如 https://example.com/mcp）",
    )
    stdio: McpStdioConfig | None = Field(
        default=None,
        description="stdio 传输时的 command/args/env（与 Cursor 一致）",
    )
    description: str = Field(default="", description="服务说明")
    enabled: bool = Field(default=True, description="是否启用")
    headers: dict[str, str] = Field(
        default_factory=dict,
        description="HTTP 传输时的附加请求头",
    )

    @model_validator(mode="after")
    def _check_transport_fields(self) -> "McpServerCreateRequest":
        if self.transport == "http":
            if not (self.url or "").strip():
                raise ValueError("HTTP 传输须填写 url")
        elif self.transport == "stdio":
            if self.stdio is None:
                raise ValueError("stdio 传输须填写 stdio（command/args/env）")
        return self


class McpServerResponse(BaseModel):
    id: str
    name: str
    transport: Literal["http", "stdio"] = "http"
    url: str | None = None
    stdio: McpStdioConfig | None = Field(
        default=None,
        description="stdio 配置（env 敏感值已脱敏）",
    )
    description: str
    enabled: bool
    headers: dict[str, str] = Field(default_factory=dict, description="HTTP 请求头（已脱敏）")
    tool_names: list[str] = Field(default_factory=list, description="已发现的工具列表")
    last_probe_at: str | None = Field(
        default=None, description="最近一次周期探测时间（ISO8601），无探测则为空"
    )
    last_probe_error: str | None = Field(
        default=None, description="最近一次探测错误摘要，成功则为空"
    )


class McpServerListResponse(BaseModel):
    servers: list[McpServerResponse]
    total: int


class McpImportRequest(BaseModel):
    """Cursor / Claude Desktop 整份 mcpServers 导入。"""

    mcpServers: dict[str, dict] = Field(..., min_length=1)


class McpImportResponse(BaseModel):
    imported: list[McpServerResponse]
    errors: list[str] = Field(default_factory=list)

/**
 * @fileoverview 内置与 MCP 工具元数据类型，供 Agent 工具选择与设置页展示。
 */

/** OpenAPI/JSON Schema 风格的单个工具参数描述。 */
export interface ToolArgInfo {
  name: string;
  type: string;
  required: boolean;
  default?: string | number | boolean | null;
  description: string;
}

/** 工具来源：平台内置或 MCP 远端注册。 */
export type ToolSource = "builtin" | "mcp";

/** 工具业务分类，驱动 Agent 工具选择器分组。 */
export type ToolCategory = "knowledge" | "formula" | "web" | "system" | "mcp";

/** GET /api/agents/tools 返回的单条工具目录项。 */
export interface BuiltinToolInfo {
  name: string;
  label: string;
  description: string;
  category: ToolCategory;
  source?: ToolSource;
  mcp_server?: string | null;
  mcp_remote_name?: string | null;
  args_schema: ToolArgInfo[];
  used_by_agents: number;
}

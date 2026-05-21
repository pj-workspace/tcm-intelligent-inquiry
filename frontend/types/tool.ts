export interface ToolArgInfo {
  name: string;
  type: string;
  required: boolean;
  default?: string | number | boolean | null;
  description: string;
}

export type ToolSource = "builtin" | "mcp";

export type ToolCategory = "knowledge" | "formula" | "web" | "system" | "mcp";

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

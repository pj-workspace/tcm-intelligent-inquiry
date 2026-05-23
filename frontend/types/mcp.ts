/**
 * @fileoverview MCP 服务器配置与批量导入响应类型。
 */

/** MCP 传输层：HTTP Streamable 或 stdio 子进程。 */
export type McpTransport = "http" | "stdio";

/** stdio 传输的 command/args/env/cwd 配置。 */
export type McpStdioConfig = {
  command: string;
  args: string[];
  env: Record<string, string>;
  cwd?: string | null;
};

/** GET /api/mcp 返回的已注册 MCP 服务实例。 */
export type McpServer = {
  id: string;
  name: string;
  transport: McpTransport;
  url: string | null;
  stdio: McpStdioConfig | null;
  description: string;
  enabled: boolean;
  headers: Record<string, string>;
  tool_names: string[];
  last_probe_at: string | null;
  last_probe_error: string | null;
};

/** POST /api/mcp/import 批量导入结果。 */
export type McpImportResponse = {
  imported: McpServer[];
  errors: string[];
};

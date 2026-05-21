export type McpTransport = "http" | "stdio";

export type McpStdioConfig = {
  command: string;
  args: string[];
  env: Record<string, string>;
  cwd?: string | null;
};

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

export type McpImportResponse = {
  imported: McpServer[];
  errors: string[];
};

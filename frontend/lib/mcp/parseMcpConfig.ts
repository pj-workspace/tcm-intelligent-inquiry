/**
 * @fileoverview MCP 配置 JSON 粘贴解析（Cursor/Claude Desktop 片段兼容）。
 */

/** MCP 传输类型（与 types/mcp 对齐的解析层别名）。 */
export type McpTransport = "http" | "stdio";

/** `parseMcpJson` 解析出的单条或批量导入结构。 */
export type McpParseResult = {
  bulkImport?: Record<string, Record<string, unknown>>;
  name?: string;
  transport?: McpTransport;
  url?: string;
  command?: string;
  argsText?: string;
  envText?: string;
  description?: string;
  authToken?: string;
};

/** 将 args 字段（数组或空）转为多行文本供表单编辑。 */
function argsToText(args: unknown): string {
  if (Array.isArray(args)) {
    return args.map(String).join("\n");
  }
  return "";
}

/** 将 env 对象转为缩进 JSON 字符串供表单编辑。 */
function envToText(env: unknown): string {
  if (env && typeof env === "object" && !Array.isArray(env)) {
    return JSON.stringify(env, null, 2);
  }
  return "";
}

/** 解析 stdio args 文本：JSON 字符串数组或逐行非空字符串。 */
export function parseArgsText(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === "string")) {
      throw new Error("args JSON 须为字符串数组");
    }
    return parsed;
  }
  return trimmed
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/** 解析 env JSON 对象为 string 键值对。 */
export function parseEnvText(text: string): Record<string, string> {
  const trimmed = text.trim();
  if (!trimmed) return {};
  const parsed = JSON.parse(trimmed) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("env 须为 JSON 对象");
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed)) {
    out[k] = String(v);
  }
  return out;
}

/** 将 Cursor 复制片段（含 trailing comma、缺外层括号）规范为可 parse 的 JSON */
export function normalizeMcpPasteText(text: string): string {
  let t = text.trim();
  if (!t) return t;

  try {
    JSON.parse(t);
    return t;
  } catch {
    // continue
  }

  t = t.replace(/,\s*$/, "");

  if (/^"[^"]+"\s*:\s*\{/.test(t)) {
    return `{ ${t} }`;
  }

  return t;
}

/** 从单条 server 配置对象构建 McpParseResult。 */
function entryFromConf(
  name: string,
  c: Record<string, unknown>
): McpParseResult | null {
  if (typeof c.command === "string" && c.command.trim()) {
    return {
      name: String(name),
      transport: "stdio",
      command: c.command,
      argsText: argsToText(c.args),
      envText: envToText(c.env),
      description: typeof c.description === "string" ? c.description : "",
    };
  }
  if (typeof c.url === "string" && c.url.trim()) {
    const authHeader =
      typeof c.headers === "object" && c.headers !== null
        ? ((c.headers as Record<string, string>)["Authorization"] ?? "")
        : "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : authHeader;
    return {
      name: String(name),
      transport: "http",
      url: c.url,
      description: typeof c.description === "string" ? c.description : "",
      authToken: token,
    };
  }
  return null;
}

/** 判断顶层对象是否形如 `{ "name": { command|url } }` 的 servers map。 */
function asMcpServersMap(
  obj: Record<string, unknown>
): Record<string, Record<string, unknown>> | null {
  const entries = Object.entries(obj);
  if (entries.length === 0) return null;
  const ok = entries.every(([, v]) => {
    if (!v || typeof v !== "object" || Array.isArray(v)) return false;
    const c = v as Record<string, unknown>;
    return (
      (typeof c.command === "string" && c.command.trim()) ||
      (typeof c.url === "string" && c.url.trim())
    );
  });
  return ok ? (obj as Record<string, Record<string, unknown>>) : null;
}

/** 解析粘贴的 MCP JSON（单条、裸 command/url 或 bulkImport）。 */
export function parseMcpJson(text: string): McpParseResult | null {
  try {
    const obj = JSON.parse(normalizeMcpPasteText(text)) as Record<string, unknown>;

    let servers: Record<string, Record<string, unknown>> | null = null;
    if (obj.mcpServers && typeof obj.mcpServers === "object") {
      servers = obj.mcpServers as Record<string, Record<string, unknown>>;
    } else {
      servers = asMcpServersMap(obj);
    }

    if (servers) {
      const entries = Object.entries(servers);
      if (entries.length === 0) return null;

      if (entries.length === 1) {
        const [name, c] = entries[0];
        return entryFromConf(name, c);
      }

      return { bulkImport: servers };
    }

    if (typeof obj.command === "string" && obj.command.trim()) {
      return {
        transport: "stdio",
        command: obj.command,
        argsText: argsToText(obj.args),
        envText: envToText(obj.env),
        description: typeof obj.description === "string" ? obj.description : "",
      };
    }

    if (typeof obj.url === "string") {
      const authHeader =
        typeof obj.headers === "object" && obj.headers !== null
          ? ((obj.headers as Record<string, string>)["Authorization"] ?? "")
          : "";
      const token = authHeader.startsWith("Bearer ")
        ? authHeader.slice(7)
        : authHeader;
      return {
        transport: "http",
        url: obj.url,
        authToken: token,
        description:
          typeof obj.description === "string" ? obj.description : "",
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** 将解析结果合并进 MCP 添加表单 state。 */
export function applyMcpParseResult<T extends {
  name: string;
  transport: McpTransport;
  url: string;
  command: string;
  argsText: string;
  envText: string;
  description: string;
  authToken: string;
  bulkImport: Record<string, Record<string, unknown>> | null;
}>(prev: T, parsed: McpParseResult): T {
  if (parsed.bulkImport) {
    return { ...prev, bulkImport: parsed.bulkImport };
  }
  return {
    ...prev,
    bulkImport: null,
    ...(parsed.name ? { name: parsed.name } : {}),
    ...(parsed.transport ? { transport: parsed.transport } : {}),
    ...(parsed.url !== undefined ? { url: parsed.url } : {}),
    ...(parsed.command !== undefined ? { command: parsed.command } : {}),
    ...(parsed.argsText !== undefined ? { argsText: parsed.argsText } : {}),
    ...(parsed.envText !== undefined ? { envText: parsed.envText } : {}),
    ...(parsed.description !== undefined ? { description: parsed.description } : {}),
    ...(parsed.authToken !== undefined ? { authToken: parsed.authToken } : {}),
  };
}

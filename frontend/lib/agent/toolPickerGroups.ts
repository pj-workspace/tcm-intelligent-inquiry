import type { BuiltinToolInfo } from "@/types/tool";

export type ToolPickerGroup = {
  id: string;
  title: string;
  kind: "builtin" | "mcp";
  tools: BuiltinToolInfo[];
};

const BUILTIN_CATEGORY_ORDER = ["knowledge", "formula", "web", "system"] as const;

const BUILTIN_CATEGORY_LABEL: Record<string, string> = {
  knowledge: "知识库",
  formula: "方剂",
  web: "联网",
  system: "系统",
};

/** 子序列 + 包含匹配，支持拼音首字母外的模糊检索 */
export function fuzzyMatch(query: string, text: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const t = text.toLowerCase();
  if (t.includes(q)) return true;
  let i = 0;
  for (const c of q) {
    const j = t.indexOf(c, i);
    if (j === -1) return false;
    i = j + 1;
  }
  return true;
}

export function toolSearchHaystack(tool: BuiltinToolInfo): string {
  return [
    tool.name,
    tool.label,
    tool.description,
    tool.mcp_server ?? "",
    tool.mcp_remote_name ?? "",
    tool.category,
  ]
    .filter(Boolean)
    .join(" ");
}

export function toolMatchesQuery(tool: BuiltinToolInfo, query: string): boolean {
  if (!query.trim()) return true;
  return fuzzyMatch(query, toolSearchHaystack(tool));
}

export function buildToolPickerGroups(tools: BuiltinToolInfo[]): ToolPickerGroup[] {
  const groups: ToolPickerGroup[] = [];

  for (const cat of BUILTIN_CATEGORY_ORDER) {
    const items = tools.filter(
      (t) => (t.source ?? "builtin") !== "mcp" && t.category === cat
    );
    if (items.length === 0) continue;
    groups.push({
      id: `builtin-${cat}`,
      title: `内置 · ${BUILTIN_CATEGORY_LABEL[cat] ?? cat}`,
      kind: "builtin",
      tools: items,
    });
  }

  const otherBuiltin = tools.filter(
    (t) =>
      (t.source ?? "builtin") !== "mcp" &&
      !BUILTIN_CATEGORY_ORDER.includes(t.category as (typeof BUILTIN_CATEGORY_ORDER)[number])
  );
  if (otherBuiltin.length > 0) {
    groups.push({
      id: "builtin-other",
      title: "内置 · 其他",
      kind: "builtin",
      tools: otherBuiltin,
    });
  }

  const mcpTools = tools.filter((t) => (t.source ?? "builtin") === "mcp");
  const byServer = new Map<string, BuiltinToolInfo[]>();
  for (const t of mcpTools) {
    const key = t.mcp_server?.trim() || "MCP";
    const list = byServer.get(key) ?? [];
    list.push(t);
    byServer.set(key, list);
  }

  for (const [server, items] of [...byServer.entries()].sort((a, b) =>
    a[0].localeCompare(b[0], "zh-CN")
  )) {
    items.sort((a, b) =>
      (a.mcp_remote_name ?? a.label).localeCompare(
        b.mcp_remote_name ?? b.label,
        "zh-CN"
      )
    );
    groups.push({
      id: `mcp-${server}`,
      title: server,
      kind: "mcp",
      tools: items,
    });
  }

  return groups;
}

export function filterToolPickerGroups(
  groups: ToolPickerGroup[],
  query: string
): ToolPickerGroup[] {
  const q = query.trim();
  if (!q) return groups;
  return groups
    .map((g) => ({
      ...g,
      tools: g.tools.filter((t) => toolMatchesQuery(t, q)),
    }))
    .filter((g) => g.tools.length > 0);
}

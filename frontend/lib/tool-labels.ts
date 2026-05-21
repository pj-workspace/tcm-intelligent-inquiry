/** 内置工具中文展示名（不含外部 MCP） */
export const TOOL_LABEL_ZH: Record<string, string> = {
  search_tcm_knowledge: "知识库检索",
  formula_lookup: "方剂查询",
  recommend_formulas: "方剂推荐",
  searx_web_search: "联网搜索",
};

/** 从 LangChain 内部名解析 MCP 远端工具名（mcp_{hash}_{remote}），保留原始 remote 片段 */
export function mcpRemoteToolName(internalName: string): string | null {
  const m = /^mcp_[^_]+_(.+)$/i.exec(internalName.trim());
  return m ? m[1] : null;
}

export function isMcpToolName(internalName: string): boolean {
  return internalName.trim().startsWith("mcp_");
}

/**
 * 工具展示名：内置走中文映射；外部 MCP 优先远端原名（SSE/元数据），否则解析内部名。
 */
export function toolDisplayName(
  internalName: string,
  mcpRemoteName?: string | null
): string {
  const n = internalName.trim();
  if (!n) return "tool";
  if (TOOL_LABEL_ZH[n]) return TOOL_LABEL_ZH[n];
  const remote = (mcpRemoteName ?? "").trim() || mcpRemoteToolName(n);
  if (remote) return remote;
  return n;
}

/** 兼容旧 import */
export function displayToolNameZh(
  internalName: string,
  mcpRemoteName?: string | null
): string {
  return toolDisplayName(internalName, mcpRemoteName);
}

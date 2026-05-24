/**
 * @fileoverview 设置页 Tab 配置与 URL 解析。
 */
import {
  Box,
  Plug,
  Bot,
  Database,
  PieChart,
  User,
  type LucideIcon,
} from "lucide-react";

export type SettingsTabId =
  | "builtin"
  | "mcp"
  | "knowledge"
  | "agents"
  | "billing"
  | "account";

export const SETTINGS_TAB_IDS: SettingsTabId[] = [
  "builtin",
  "mcp",
  "knowledge",
  "agents",
  "billing",
  "account",
];

export type SettingsTabConfig = {
  id: SettingsTabId;
  label: string;
  shortLabel: string;
  Icon: LucideIcon;
};

export const SETTINGS_TABS: SettingsTabConfig[] = [
  { id: "builtin", label: "内置工具", shortLabel: "内置", Icon: Box },
  { id: "mcp", label: "MCP 服务", shortLabel: "MCP", Icon: Plug },
  { id: "knowledge", label: "知识库", shortLabel: "知识库", Icon: Database },
  { id: "agents", label: "Agent 管理", shortLabel: "Agent", Icon: Bot },
  { id: "billing", label: "计费与用量", shortLabel: "计费", Icon: PieChart },
  { id: "account", label: "账号与安全", shortLabel: "账号", Icon: User },
];

/** 从 query `tab` 解析有效 Tab id，无效时返回 `fallback`。 */
export function parseSettingsTabId(
  raw: string | null | undefined,
  fallback: SettingsTabId = "builtin",
): SettingsTabId {
  const id = raw?.trim();
  if (id && SETTINGS_TAB_IDS.includes(id as SettingsTabId)) {
    return id as SettingsTabId;
  }
  return fallback;
}

/** 取 Tab 展示标题。 */
export function settingsTabLabel(id: SettingsTabId): string {
  return SETTINGS_TABS.find((t) => t.id === id)?.label ?? "设置";
}

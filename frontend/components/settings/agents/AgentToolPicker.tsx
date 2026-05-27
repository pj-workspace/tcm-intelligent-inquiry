/**
 * @fileoverview Agent 工具多选面板：按类别分组、搜索与批量勾选。
 */
"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Search, Terminal, Wrench } from "lucide-react";
import {
  buildToolPickerGroups,
  filterToolPickerGroups,
  type ToolPickerGroup,
} from "@/lib/agent/toolPickerGroups";
import type { BuiltinToolInfo } from "@/types/tool";

const CATEGORY_DOT: Record<string, string> = {
  knowledge: "bg-orange-400",
  formula: "bg-emerald-400",
  web: "bg-blue-400",
  system: "bg-gray-400",
  mcp: "bg-violet-400",
};

interface AgentToolPickerProps {
  toolInfos: BuiltinToolInfo[];
  selected: string[];
  onToggle: (toolName: string) => void;
  onSetSelected: (names: string[]) => void;
}

/** 工具选择卡片（勾选切换）。 */
function ToolCard({
  tool,
  checked,
  onToggle,
  accent,
}: {
  tool: BuiltinToolInfo;
  checked: boolean;
  onToggle: () => void;
  accent: "orange" | "violet";
}) {
  const dot = CATEGORY_DOT[tool.category] ?? "bg-gray-400";
  const summary =
    tool.description.split("\n").map((l) => l.trim()).filter(Boolean)[0] ?? "";
  const checkedCls =
    accent === "violet"
      ? "border-violet-300 bg-violet-50/50 ring-1 ring-violet-100"
      : "border-orange-300 bg-orange-50/50 ring-1 ring-orange-100";
  const checkboxCls =
    accent === "violet"
      ? "text-violet-500 focus:ring-violet-500"
      : "text-orange-500 focus:ring-orange-500";

  return (
    <label
      className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-colors ${
        checked
          ? checkedCls
          : "border-border bg-surface hover:border-border hover:bg-muted"
      }`}
    >
      <input
        type="checkbox"
        className={`mt-0.5 rounded border-border ${checkboxCls}`}
        checked={checked}
        onChange={onToggle}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
          <span className="text-sm font-medium text-foreground">{tool.label}</span>
        </div>
        <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
          {tool.mcp_remote_name && tool.mcp_remote_name !== tool.name
            ? `${tool.mcp_remote_name} · ${tool.name}`
            : tool.name}
        </p>
        {summary && (
          <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {summary}
          </p>
        )}
      </div>
    </label>
  );
}

/** 按类别折叠展示的一组工具。 */
function ToolGroupSection({
  group,
  selectedSet,
  onToggle,
  onSetGroup,
  defaultCollapsed,
  forceExpand,
}: {
  group: ToolPickerGroup;
  selectedSet: Set<string>;
  onToggle: (name: string) => void;
  onSetGroup: (names: string[], add: boolean) => void;
  defaultCollapsed: boolean;
  forceExpand: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const expanded = forceExpand || !collapsed;
  const names = group.tools.map((t) => t.name);
  const selectedInGroup = names.filter((n) => selectedSet.has(n)).length;
  const allSelected = names.length > 0 && selectedInGroup === names.length;
  const accent = group.kind === "mcp" ? "violet" : "orange";

  return (
    <div className="rounded-lg border border-border bg-muted">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {group.kind === "mcp" ? (
            <Terminal className="h-3.5 w-3.5 shrink-0 text-violet-500" />
          ) : (
            <Wrench className="h-3.5 w-3.5 shrink-0 text-orange-500" />
          )}
          <span className="truncate text-xs font-semibold text-foreground">
            {group.title}
          </span>
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {selectedInGroup}/{group.tools.length}
          </span>
          <ChevronDown
            className={`ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${
              expanded ? "rotate-180" : ""
            }`}
          />
        </button>
        <button
          type="button"
          onClick={() => onSetGroup(names, !allSelected)}
          className="shrink-0 text-[10px] text-orange-600 hover:text-orange-700"
        >
          {allSelected ? "取消本组" : "全选本组"}
        </button>
      </div>
      {expanded && (
        <div className="grid gap-2 border-t border-border p-3 md:grid-cols-2">
          {group.tools.map((tool) => (
            <ToolCard
              key={tool.name}
              tool={tool}
              checked={selectedSet.has(tool.name)}
              onToggle={() => onToggle(tool.name)}
              accent={accent}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Agent 表单内嵌的工具多选器。 */
export function AgentToolPicker({
  toolInfos,
  selected,
  onToggle,
  onSetSelected,
}: AgentToolPickerProps) {
  const [query, setQuery] = useState("");
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const allGroups = useMemo(
    () => buildToolPickerGroups(toolInfos),
    [toolInfos]
  );
  const visibleGroups = useMemo(
    () => filterToolPickerGroups(allGroups, query),
    [allGroups, query]
  );
  const searching = query.trim().length > 0;
  const visibleCount = visibleGroups.reduce((n, g) => n + g.tools.length, 0);

  const setGroupSelected = (names: string[], add: boolean) => {
    if (add) {
      const merged = new Set([...selected, ...names]);
      onSetSelected([...merged]);
    } else {
      const remove = new Set(names);
      onSetSelected(selected.filter((n) => !remove.has(n)));
    }
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索工具名、MCP 服务、描述…（支持模糊匹配）"
          className="w-full rounded-lg border border-border py-2 pl-9 pr-3 text-sm outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
        />
      </div>

      {searching && (
        <p className="text-[11px] text-muted-foreground">
          找到 {visibleCount} 个工具
          {visibleCount === 0 ? "，请换个关键词" : ""}
        </p>
      )}

      {toolInfos.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
          暂无可绑定工具
        </div>
      ) : visibleGroups.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
          没有匹配「{query.trim()}」的工具
        </div>
      ) : (
        <div className="max-h-[min(42vh,420px)] space-y-3 overflow-y-auto pr-1">
          {visibleGroups.map((group) => (
            <ToolGroupSection
              key={group.id}
              group={group}
              selectedSet={selectedSet}
              onToggle={onToggle}
              onSetGroup={setGroupSelected}
              defaultCollapsed={group.kind === "mcp" && group.tools.length > 6}
              forceExpand={searching}
            />
          ))}
        </div>
      )}
    </div>
  );
}

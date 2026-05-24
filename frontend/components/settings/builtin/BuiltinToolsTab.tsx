/**
 * @fileoverview 内置工具 Tab：按类别浏览与试调用（ToolInvokeModal）。
 */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import clsx from "clsx";
import {
  BookOpen,
  ChevronRight,
  Database,
  Globe,
  Settings,
  Terminal,
  Users,
} from "lucide-react";
import { API_BASE, apiHeaders } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { SettingsEmptyResults } from "@/components/settings/shell/SettingsEmptyResults";
import { SettingsListToolbar } from "@/components/settings/shell/SettingsListToolbar";
import { SettingsPagination } from "@/components/settings/shell/SettingsPagination";
import { useSettingsListControls } from "@/components/settings/shell/useSettingsListControls";
import { ToolInvokeModal } from "./ToolInvokeModal";
import type { BuiltinToolInfo, ToolCategory } from "@/types/tool";

const PAGE_SIZE = 10;

const CATEGORY_META: Record<
  ToolCategory,
  { label: string; color: string; bg: string; Icon: React.ElementType }
> = {
  knowledge: { label: "知识库", color: "text-orange-600", bg: "bg-orange-50", Icon: Database },
  formula:   { label: "方剂",   color: "text-emerald-600", bg: "bg-emerald-50", Icon: BookOpen },
  web:       { label: "联网",   color: "text-blue-600",    bg: "bg-blue-50",    Icon: Globe },
  system:    { label: "系统",   color: "text-gray-500",    bg: "bg-gray-100",   Icon: Settings },
  mcp:       { label: "MCP",    color: "text-violet-600",  bg: "bg-violet-50",  Icon: Terminal },
};

function toolMatchesQuery(tool: BuiltinToolInfo, query: string): boolean {
  const summary = tool.description.split("\n").map((l) => l.trim()).filter(Boolean)[0] ?? "";
  const haystack = [
    tool.label,
    tool.name,
    summary,
    CATEGORY_META[tool.category]?.label ?? tool.category,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

/** 内置工具卡片：点击打开试调用模态。 */
function ToolCard({
  tool,
  onClick,
}: {
  tool: BuiltinToolInfo;
  onClick: () => void;
}) {
  const meta = CATEGORY_META[tool.category] ?? CATEGORY_META.system;
  const { Icon } = meta;
  const summary = tool.description.split("\n").map((l) => l.trim()).filter(Boolean)[0] ?? "";

  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full rounded-xl border border-[#e5e5e5] bg-white p-4 text-left shadow-sm transition-all hover:border-orange-200 hover:shadow-md sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${meta.bg} ${meta.color}`}
          >
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-gray-900">{tool.label}</h3>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${meta.bg} ${meta.color}`}
              >
                {meta.label}
              </span>
            </div>
            <p className="mt-0.5 font-mono text-xs text-gray-400">{tool.name}</p>
          </div>
        </div>
        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-orange-400" />
      </div>

      <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-gray-600">{summary}</p>

      <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
        <div className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" />
          {tool.used_by_agents > 0 ? (
            <span>
              被{" "}
              <span className="font-medium text-gray-600">{tool.used_by_agents}</span> 个 Agent
              使用
            </span>
          ) : (
            "暂无 Agent 引用"
          )}
        </div>
        {tool.args_schema.length > 0 && (
          <span>{tool.args_schema.length} 个参数</span>
        )}
      </div>
    </button>
  );
}

/** 内置工具 Tab：卡片网格 + 试调用模态。 */
export function BuiltinToolsTab() {
  const { token } = useAuth();
  const [tools, setTools] = useState<BuiltinToolInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<BuiltinToolInfo | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<ToolCategory | "all">("all");

  const filterFn = useCallback(
    (tool: BuiltinToolInfo, query: string) => toolMatchesQuery(tool, query),
    [],
  );

  const categoryScopedTools = useMemo(() => {
    if (categoryFilter === "all") return tools;
    return tools.filter((t) => t.category === categoryFilter);
  }, [tools, categoryFilter]);

  const list = useSettingsListControls(categoryScopedTools, {
    pageSize: PAGE_SIZE,
    filter: filterFn,
  });

  const categories = useMemo(
    () => Array.from(new Set(tools.map((t) => t.category))) as ToolCategory[],
    [tools],
  );

  useEffect(() => {
    if (!token) return;
    let mounted = true;
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/agents/tools`, {
          headers: apiHeaders(token),
        });
        if (!res.ok) throw new Error("获取工具列表失败");
        const data = (await res.json()) as { tools: BuiltinToolInfo[] };
        if (mounted) {
          setTools((data.tools || []).filter((t) => !t.name.startsWith("mcp_")));
        }
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [token]);

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-orange-200 border-t-orange-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600">加载失败: {error}</div>
    );
  }

  const totalAgentRefs = tools.reduce((s, t) => s + t.used_by_agents, 0);
  const showGrouped =
    !list.isFiltering && categoryFilter === "all" && !list.hasPagination;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-gray-900">内置工具</h2>
          <p className="mt-1 text-sm text-gray-500">
            系统核心功能所依赖的工具集，点击卡片查看详情和在线试用。
          </p>
        </div>
        {tools.length > 0 && (
          <div className="flex w-full shrink-0 items-center gap-1.5 rounded-full bg-gray-50 px-3 py-1.5 text-xs text-gray-500 ring-1 ring-inset ring-gray-200 sm:w-auto">
            共 <span className="font-semibold text-gray-700">{tools.length}</span> 个工具 ·
            Agent 引用{" "}
            <span className="font-semibold text-gray-700">{totalAgentRefs}</span> 次
          </div>
        )}
      </div>

      {tools.length > 0 && (
        <SettingsListToolbar
          query={list.query}
          onQueryChange={list.setQuery}
          placeholder="搜索工具名称、标识或描述…"
          totalCount={list.totalCount}
          filteredCount={list.filteredCount}
        >
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-0.5">
            <button
              type="button"
              onClick={() => setCategoryFilter("all")}
              className={clsx(
                "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition",
                categoryFilter === "all"
                  ? "bg-orange-100 text-orange-800 ring-1 ring-orange-200"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200",
              )}
            >
              全部
            </button>
            {categories.map((cat) => {
              const meta = CATEGORY_META[cat] ?? CATEGORY_META.system;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={clsx(
                    "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition",
                    categoryFilter === cat
                      ? "bg-orange-100 text-orange-800 ring-1 ring-orange-200"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200",
                  )}
                >
                  {meta.label}
                </button>
              );
            })}
          </div>
        </SettingsListToolbar>
      )}

      {tools.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
          暂无内置工具
        </div>
      ) : list.filteredCount === 0 ? (
        <SettingsEmptyResults
          query={list.query || CATEGORY_META[categoryFilter as ToolCategory]?.label || "筛选"}
          onClear={() => {
            list.setQuery("");
            setCategoryFilter("all");
          }}
        />
      ) : showGrouped ? (
        categories.map((cat) => {
          const group = tools.filter((t) => t.category === cat);
          const catMeta = CATEGORY_META[cat] ?? CATEGORY_META.system;
          return (
            <div key={cat}>
              <div className="mb-3 flex items-center gap-2">
                <catMeta.Icon className={`h-4 w-4 ${catMeta.color}`} />
                <span className="text-sm font-medium text-gray-700">{catMeta.label}</span>
                <div className="h-px flex-1 bg-gray-100" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {group.map((tool) => (
                  <ToolCard key={tool.name} tool={tool} onClick={() => setActiveTool(tool)} />
                ))}
              </div>
            </div>
          );
        })
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {list.paginatedItems.map((tool) => (
              <ToolCard key={tool.name} tool={tool} onClick={() => setActiveTool(tool)} />
            ))}
          </div>
          <SettingsPagination
            page={list.page}
            totalPages={list.totalPages}
            onPageChange={list.setPage}
            filteredCount={list.filteredCount}
            pageSize={list.pageSize}
          />
        </>
      )}

      {activeTool && (
        <AnimatePresence mode="sync">
          <ToolInvokeModal
            key={activeTool.name}
            tool={activeTool}
            onClose={() => setActiveTool(null)}
          />
        </AnimatePresence>
      )}
    </div>
  );
}

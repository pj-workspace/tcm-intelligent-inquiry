"use client";

import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
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
import { ToolInvokeModal } from "./ToolInvokeModal";
import type { BuiltinToolInfo, ToolCategory } from "@/types/tool";

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

// ── 单张工具卡片（纯展示，点击开模态框）────────────────────────────────────────
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
      className="group w-full rounded-xl border border-[#e5e5e5] bg-white p-5 text-left shadow-sm transition-all hover:border-orange-200 hover:shadow-md"
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

// ── 主组件 ────────────────────────────────────────────────────────────────────
export function BuiltinToolsTab() {
  const { token } = useAuth();
  const [tools, setTools] = useState<BuiltinToolInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<BuiltinToolInfo | null>(null);

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
    return () => { mounted = false; };
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
  const categories = Array.from(new Set(tools.map((t) => t.category))) as ToolCategory[];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
      {/* 头部 */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">内置工具</h2>
          <p className="mt-1 text-sm text-gray-500">
            系统核心功能所依赖的工具集，点击卡片查看详情和在线试用。
          </p>
        </div>
        {tools.length > 0 && (
          <div className="flex items-center gap-1.5 rounded-full bg-gray-50 px-3 py-1.5 text-xs text-gray-500 ring-1 ring-inset ring-gray-200">
            共 <span className="font-semibold text-gray-700">{tools.length}</span> 个工具 ·
            Agent 引用{" "}
            <span className="font-semibold text-gray-700">{totalAgentRefs}</span> 次
          </div>
        )}
      </div>

      {tools.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
          暂无内置工具
        </div>
      ) : (
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

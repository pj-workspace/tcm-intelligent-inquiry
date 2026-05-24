/**
 * @fileoverview Agent 卡片：展示配置摘要与编辑/克隆/删除/设默认操作。
 */
"use client";

import { useMemo, useState } from "react";
import {
  Bot,
  ChevronDown,
  Copy,
  Edit2,
  FileText,
  Star,
  Trash2,
} from "lucide-react";
import clsx from "clsx";
import { toolDisplayName } from "@/lib/tool-labels";
import type { Agent, KnowledgeBaseLite } from "@/types/agent";
import type { BuiltinToolInfo } from "@/types/tool";

interface AgentCardProps {
  agent: Agent;
  isDefault: boolean;
  knowledgeBases: KnowledgeBaseLite[];
  toolInfos: BuiltinToolInfo[];
  onSetDefault: (id: string | null) => void;
  onEdit: (agent: Agent) => void;
  onClone: (agent: Agent) => void;
  onDelete: (id: string) => void;
}

const CATEGORY_DOT: Record<string, string> = {
  knowledge: "bg-orange-400",
  formula: "bg-emerald-400",
  web: "bg-blue-400",
  system: "bg-gray-400",
  mcp: "bg-violet-400",
};

const TOOLS_COLLAPSE_THRESHOLD = 4;
const TOOLS_PREVIEW_COUNT = 3;

function resolveToolMeta(
  toolName: string,
  toolInfoMap: Map<string, BuiltinToolInfo>,
): { label: string; dot: string; title: string } {
  const info = toolInfoMap.get(toolName);
  const isMcp = info?.source === "mcp" || toolName.startsWith("mcp_");
  const dot = info
    ? (CATEGORY_DOT[info.category] ?? "bg-gray-400")
    : isMcp
      ? "bg-violet-400"
      : "bg-gray-400";
  const label = info?.mcp_remote_name ?? info?.label ?? toolDisplayName(toolName);
  return { label, dot, title: toolName };
}

function ToolChip({ label, dot, title }: { label: string; dot: string; title: string }) {
  return (
    <span
      className="inline-flex max-w-full items-center gap-1.5 rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-700"
      title={title}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
      <span className="truncate">{label}</span>
    </span>
  );
}

/** 单个 Agent 配置卡片。 */
export function AgentCard({
  agent,
  isDefault,
  knowledgeBases,
  toolInfos,
  onSetDefault,
  onEdit,
  onClone,
  onDelete,
}: AgentCardProps) {
  const [showPrompt, setShowPrompt] = useState(false);
  const toolCount = agent.tool_names.length;
  const [toolsExpanded, setToolsExpanded] = useState(
    toolCount <= TOOLS_COLLAPSE_THRESHOLD,
  );
  const toolInfoMap = useMemo(
    () => new Map(toolInfos.map((t) => [t.name, t])),
    [toolInfos],
  );
  const toolMetas = useMemo(
    () => agent.tool_names.map((t) => resolveToolMeta(t, toolInfoMap)),
    [agent.tool_names, toolInfoMap],
  );
  const trimmedPrompt = agent.system_prompt?.trim() ?? "";
  const hasPrompt = trimmedPrompt.length > 0;
  const toolsCollapsible = toolCount > TOOLS_COLLAPSE_THRESHOLD;
  const toolsPreviewText = toolMetas
    .slice(0, TOOLS_PREVIEW_COUNT)
    .map((t) => t.label)
    .join("、");

  return (
    <div
      className={`overflow-hidden rounded-xl border bg-white shadow-sm transition-all hover:shadow-md ${
        isDefault
          ? "border-orange-300 ring-1 ring-orange-100"
          : "border-[#e5e5e5]"
      }`}
    >
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
        <div className="flex min-w-0 items-start gap-4">
          <div
            className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              isDefault
                ? "bg-orange-100 text-orange-600"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            <Bot className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-gray-900">{agent.name}</h3>
              {isDefault && (
                <span className="flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-medium text-orange-700">
                  <Star className="h-3 w-3 fill-orange-500 text-orange-500" />
                  默认选用
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-gray-600">
              {agent.description || "暂无说明"}
            </p>

            <div className="mt-3">
              {toolCount === 0 ? (
                <>
                  <div className="text-[11px] font-medium text-gray-400">绑定工具</div>
                  <p className="mt-1 text-xs italic text-gray-400">无</p>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => toolsCollapsible && setToolsExpanded((v) => !v)}
                    disabled={!toolsCollapsible}
                    className={clsx(
                      "flex items-center gap-1 text-[11px] font-medium text-gray-400",
                      toolsCollapsible &&
                        "rounded-md transition-colors hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/20",
                    )}
                  >
                    绑定工具（{toolCount}）
                    {toolsCollapsible && (
                      <ChevronDown
                        className={clsx(
                          "h-3.5 w-3.5 transition-transform",
                          toolsExpanded && "rotate-180",
                        )}
                        aria-hidden
                      />
                    )}
                  </button>

                  {toolsCollapsible && !toolsExpanded ? (
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-gray-500">
                      {toolsPreviewText}
                      {toolCount > TOOLS_PREVIEW_COUNT ? (
                        <span className="text-gray-400"> 等 {toolCount} 个</span>
                      ) : null}
                    </p>
                  ) : (
                    <div
                      className={clsx(
                        "mt-1.5 flex flex-wrap gap-1.5",
                        toolCount > TOOLS_COLLAPSE_THRESHOLD &&
                          "max-h-28 overflow-y-auto pr-0.5",
                      )}
                    >
                      {toolMetas.map((meta) => (
                        <ToolChip
                          key={meta.title}
                          label={meta.label}
                          dot={meta.dot}
                          title={meta.title}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="mt-3">
              <div className="text-[11px] font-medium text-gray-400">默认知识库</div>
              <p className="mt-1 text-xs text-gray-600">
                {agent.default_kb_id ? (
                  <>
                    {knowledgeBases.find((k) => k.id === agent.default_kb_id)?.name ??
                      "（未在列表中）"}{" "}
                    <span className="font-mono text-gray-400">
                      {agent.default_kb_id}
                    </span>
                  </>
                ) : (
                  <span className="italic text-gray-400">未指定</span>
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 self-end sm:self-auto">
          <button
            onClick={() => onSetDefault(isDefault ? null : agent.id)}
            title={isDefault ? "取消默认" : "设为默认"}
            className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
              isDefault
                ? "bg-orange-50 text-orange-600 hover:bg-orange-100"
                : "text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            }`}
          >
            <Star className={`h-4 w-4 ${isDefault ? "fill-orange-500" : ""}`} />
          </button>
          <button
            onClick={() => onClone(agent)}
            title="克隆此 Agent"
            className="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <Copy className="h-4 w-4" />
          </button>
          <button
            onClick={() => onEdit(agent)}
            title="编辑"
            className="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <Edit2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => onDelete(agent.id)}
            title="删除"
            className="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 系统提示词折叠区 */}
      <div className="border-t border-gray-50 bg-[#fafaf8]">
        <button
          type="button"
          onClick={() => hasPrompt && setShowPrompt((v) => !v)}
          disabled={!hasPrompt}
          className={`flex w-full items-center justify-between px-5 py-2.5 text-xs text-gray-500 transition-colors ${
            hasPrompt ? "hover:bg-gray-100/50" : "cursor-default opacity-60"
          }`}
        >
          <span className="flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            系统提示词
            {hasPrompt ? (
              <span className="text-gray-400">（{trimmedPrompt.length} 字符）</span>
            ) : (
              <span className="italic text-gray-400">未配置（使用系统默认）</span>
            )}
          </span>
          {hasPrompt && (
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${
                showPrompt ? "rotate-180" : ""
              }`}
            />
          )}
        </button>
        {hasPrompt && showPrompt && (
          <div className="border-t border-gray-100 px-5 py-3">
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-gray-600">
              {trimmedPrompt}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

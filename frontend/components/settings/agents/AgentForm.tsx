/**
 * @fileoverview Agent 创建/编辑表单：系统提示、工具与知识库绑定。
 */
"use client";

import { Bot, RotateCcw, Save, Wrench, X } from "lucide-react";
import { Select } from "@/components/ui/Select";
import { DEFAULT_SYSTEM_PROMPT } from "@/hooks/useAgents";
import { AgentToolPicker } from "@/components/settings/agents/AgentToolPicker";
import type { AgentFormData, KnowledgeBaseLite } from "@/types/agent";
import type { BuiltinToolInfo } from "@/types/tool";

interface AgentFormProps {
  editingId: string;
  formData: AgentFormData;
  setFormData: React.Dispatch<React.SetStateAction<AgentFormData>>;
  availableTools: string[];
  toolInfos: BuiltinToolInfo[];
  knowledgeBases: KnowledgeBaseLite[];
  isSubmitting: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  toggleTool: (toolName: string) => void;
}

/** Agent 编辑表单（新建或更新）。 */
export function AgentForm({
  editingId,
  formData,
  setFormData,
  availableTools,
  toolInfos,
  knowledgeBases,
  isSubmitting,
  onSubmit,
  onCancel,
  toggleTool,
}: AgentFormProps) {
  const isNew = editingId === "new";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && !isSubmitting && onCancel()}
    >
      <form
        onSubmit={onSubmit}
        className="flex h-[88vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl"
      >
        {/* ── 头部 ── */}
        <div className="flex items-start justify-between border-b border-gray-100 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                {isNew ? "创建新 Agent" : "编辑 Agent"}
              </h2>
              <p className="mt-0.5 text-xs text-gray-500">
                自定义系统提示词、工具集与默认知识库
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── 滚动主体 ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* 基本信息 */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">
                名称 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
                placeholder="例如: 中医知识库助手"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">说明</label>
              <input
                type="text"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
                placeholder="用于检索文献与方剂…"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
              />
            </div>
          </div>

          {/* 系统提示词 */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-gray-700">
                系统提示词 (System Prompt)
              </label>
              <div className="flex items-center gap-3 text-[11px] text-gray-400">
                <span>{formData.system_prompt.length} 字符</span>
                <button
                  type="button"
                  onClick={() =>
                    setFormData((p) => ({ ...p, system_prompt: DEFAULT_SYSTEM_PROMPT }))
                  }
                  title="恢复默认模板（标有「&lt;待填&gt;」处需自行替换）"
                  className="flex items-center gap-1 text-orange-500 hover:text-orange-600"
                >
                  <RotateCcw className="h-3 w-3" />
                  默认模板
                </button>
                <button
                  type="button"
                  onClick={() => setFormData((p) => ({ ...p, system_prompt: "" }))}
                  className="text-gray-500 hover:text-gray-700"
                >
                  清空
                </button>
              </div>
            </div>
            <textarea
              className="w-full resize-y rounded-md border border-gray-300 px-3 py-2 font-mono text-xs leading-relaxed outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
              placeholder="留空则使用系统默认提示词…"
              rows={10}
              value={formData.system_prompt}
              onChange={(e) =>
                setFormData({ ...formData, system_prompt: e.target.value })
              }
            />
            <p className="mt-1 text-[11px] text-gray-400">
              模板里 <code className="rounded bg-gray-100 px-1 font-mono text-gray-500">&lt;待填：…&gt;</code>{" "}
              处需替换为你的实际场景描述。
            </p>
          </div>

          {/* 默认知识库 */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">
              默认知识库（search_tcm_knowledge 未指定 kb_id 时使用）
            </label>
            <Select
              value={formData.default_kb_id}
              onValueChange={(v) =>
                setFormData((prev) => ({ ...prev, default_kb_id: v }))
              }
              placeholder="选择默认知识库"
              options={[
                {
                  value: "",
                  label: "不指定（按系统默认或您名下第一个知识库）",
                },
                ...knowledgeBases.map((k) => ({ value: k.id, label: k.name })),
              ]}
            />
          </div>

          {/* 工具选择 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-xs font-medium text-gray-700">
                <Wrench className="h-3.5 w-3.5" />
                绑定工具
              </label>
              <div className="flex items-center gap-3 text-[11px] text-gray-400">
                <span>已选 {formData.tool_names.length} / {availableTools.length}</span>
                <button
                  type="button"
                  onClick={() =>
                    setFormData((p) => ({ ...p, tool_names: [...availableTools] }))
                  }
                  className="text-orange-500 hover:text-orange-600"
                >
                  全选
                </button>
                <button
                  type="button"
                  onClick={() => setFormData((p) => ({ ...p, tool_names: [] }))}
                  className="text-gray-500 hover:text-gray-700"
                >
                  清空
                </button>
              </div>
            </div>

            {availableTools.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-200 py-6 text-center text-xs text-gray-500">
                暂无可绑定工具
              </div>
            ) : (
              <AgentToolPicker
                toolInfos={toolInfos}
                selected={formData.tool_names}
                onToggle={toggleTool}
                onSetSelected={(names) =>
                  setFormData((p) => ({ ...p, tool_names: names }))
                }
              />
            )}
          </div>
        </div>

        {/* ── 底部 ── */}
        <div className="flex shrink-0 justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-40"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex items-center gap-2 rounded-lg bg-black px-5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-gray-800 disabled:opacity-50"
          >
            {isSubmitting ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isSubmitting ? "保存中…" : "保存"}
          </button>
        </div>
      </form>
    </div>
  );
}

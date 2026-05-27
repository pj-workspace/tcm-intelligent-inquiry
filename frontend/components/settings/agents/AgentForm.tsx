/**
 * @fileoverview Agent 创建/编辑表单：系统提示、工具与知识库绑定。
 */
"use client";

import { Bot, RotateCcw, Save, Sparkles, Wrench, X } from "lucide-react";
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
  isGeneratingPrompt?: boolean;
  onGenerateSystemPrompt?: () => void;
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
  isGeneratingPrompt = false,
  onGenerateSystemPrompt,
  onSubmit,
  onCancel,
  toggleTool,
}: AgentFormProps) {
  const isNew = editingId === "new";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => e.target === e.currentTarget && !isSubmitting && onCancel()}
    >
      <form
        onSubmit={onSubmit}
        className="flex h-dvh w-full max-w-3xl flex-col rounded-none bg-surface shadow-2xl sm:h-[min(88dvh,100dvh)] sm:rounded-2xl"
      >
        {/* ── 头部 ── */}
        <div className="flex items-start justify-between border-b border-border px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">
                {isNew ? "创建新 Agent" : "编辑 Agent"}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                自定义系统提示词、工具集与默认知识库
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-muted-foreground disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── 滚动主体 ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* 基本信息 */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">
                名称 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
                placeholder="例如: 中医知识库助手"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">说明</label>
              <input
                type="text"
                className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
                placeholder="用于检索文献与方剂…"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">
              AI 生成补充需求（可选）
            </label>
            <input
              type="text"
              className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
              placeholder="例如：偏临床教学、语气通俗易懂、优先用经方…"
              value={formData.user_requirements}
              onChange={(e) =>
                setFormData({ ...formData, user_requirements: e.target.value })
              }
            />
            <p className="text-[11px] text-muted-foreground">
              点击「AI 生成」时会一并参考；名称与说明为主要依据。
            </p>
          </div>

          {/* 系统提示词 */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-foreground">
                系统提示词 (System Prompt)
              </label>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span>{formData.system_prompt.length} 字符</span>
                {onGenerateSystemPrompt && (
                  <button
                    type="button"
                    onClick={onGenerateSystemPrompt}
                    disabled={
                      isSubmitting ||
                      isGeneratingPrompt ||
                      !formData.name.trim()
                    }
                    title={
                      formData.name.trim()
                        ? "根据名称、说明与可用工具生成 XML 提示词并推荐工具"
                        : "请先填写 Agent 名称"
                    }
                    className="flex items-center gap-1 text-violet-600 hover:text-violet-700 disabled:opacity-40"
                  >
                    {isGeneratingPrompt ? (
                      <div className="h-3 w-3 animate-spin rounded-full border-2 border-violet-200 border-t-violet-600" />
                    ) : (
                      <Sparkles className="h-3 w-3" />
                    )}
                    AI 生成
                  </button>
                )}
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
                  className="text-muted-foreground hover:text-foreground"
                >
                  清空
                </button>
              </div>
            </div>
            <textarea
              className="w-full resize-y rounded-md border border-border px-3 py-2 font-mono text-xs leading-relaxed outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
              placeholder="留空则使用系统默认提示词…"
              rows={10}
              value={formData.system_prompt}
              onChange={(e) =>
                setFormData({ ...formData, system_prompt: e.target.value })
              }
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              使用「AI 生成」可自动产出 XML 结构提示词并推荐工具；也可手动编辑。
            </p>
          </div>

          {/* 默认知识库 */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">
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
              <label className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Wrench className="h-3.5 w-3.5" />
                绑定工具
              </label>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
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
                  className="text-muted-foreground hover:text-foreground"
                >
                  清空
                </button>
              </div>
            </div>

            {availableTools.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
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
        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border px-4 py-4 sm:flex-row sm:justify-end sm:gap-3 sm:px-6">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex items-center gap-2 rounded-lg bg-primary text-primary-foreground shadow-sm transition-colors hover:opacity-90 disabled:opacity-50"
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

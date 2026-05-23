/**
 * @fileoverview Agent 管理 Tab：列表、表单与删除确认。
 */
"use client";

import { Plus, Bot } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useAgents } from "@/hooks/useAgents";
import { AgentForm } from "./AgentForm";
import { AgentCard } from "./AgentCard";

/** Agent 列表与 CRUD 入口 Tab。 */
export function AgentsTab() {
  const { token } = useAuth();
  const {
    agents,
    availableTools,
    toolInfos,
    knowledgeBases,
    loading,
    error,
    defaultAgentId,
    deleteId,
    setDeleteId,
    isDeleting,
    editingId,
    isSubmitting,
    formData,
    setFormData,
    handleSetDefault,
    handleStartCreate,
    handleStartEdit,
    handleStartClone,
    handleCancelEdit,
    toggleTool,
    handleSubmit,
    confirmDelete,
  } = useAgents(token);

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-orange-200 border-t-orange-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
      <ConfirmDialog
        open={deleteId !== null}
        title="删除 Agent"
        description="确定要删除该 Agent 吗？此操作无法撤销。"
        confirmLabel="删除"
        cancelLabel="取消"
        danger
        pending={isDeleting}
        onConfirm={confirmDelete}
        onCancel={() => !isDeleting && setDeleteId(null)}
      />

      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Agent 管理</h2>
          <p className="mt-1 text-sm text-gray-500">
            自定义系统提示词、工具集与默认知识库，创建多用途的 AI 助手。
          </p>
        </div>
        <div className="flex items-center gap-3">
          {agents.length > 0 && (
            <div className="hidden items-center gap-1.5 rounded-full bg-gray-50 px-3 py-1.5 text-xs text-gray-500 ring-1 ring-inset ring-gray-200 sm:flex">
              共 <span className="font-semibold text-gray-700">{agents.length}</span> 个 Agent
            </div>
          )}
          <button
            onClick={handleStartCreate}
            className="flex items-center gap-2 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-gray-800"
          >
            <Plus className="h-4 w-4" />
            创建 Agent
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600">
          加载失败: {error}
        </div>
      )}

      <div className="grid gap-4">
        {agents.length === 0 && !error ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 py-12 text-center text-sm text-gray-500">
            <Bot className="mb-3 h-8 w-8 text-gray-300" />
            <p>暂无自定义 Agent</p>
            <p className="mt-1 text-xs">点击右上角创建新的智能助手</p>
          </div>
        ) : (
          agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              isDefault={defaultAgentId === agent.id}
              knowledgeBases={knowledgeBases}
              toolInfos={toolInfos}
              onSetDefault={handleSetDefault}
              onEdit={handleStartEdit}
              onClone={handleStartClone}
              onDelete={setDeleteId}
            />
          ))
        )}
      </div>

      {editingId !== null && (
        <AgentForm
          editingId={editingId}
          formData={formData}
          setFormData={setFormData}
          availableTools={availableTools}
          toolInfos={toolInfos}
          knowledgeBases={knowledgeBases}
          isSubmitting={isSubmitting}
          onSubmit={handleSubmit}
          onCancel={handleCancelEdit}
          toggleTool={toggleTool}
        />
      )}
    </div>
  );
}

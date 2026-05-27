/**
 * @fileoverview Agent 管理 Tab：列表、表单与删除确认。
 */
"use client";

import { useCallback } from "react";
import { Plus, Bot } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SettingsEmptyResults } from "@/components/settings/shell/SettingsEmptyResults";
import { SettingsListToolbar } from "@/components/settings/shell/SettingsListToolbar";
import { SettingsPagination } from "@/components/settings/shell/SettingsPagination";
import { useSettingsListControls } from "@/components/settings/shell/useSettingsListControls";
import { useAgents } from "@/hooks/useAgents";
import type { Agent } from "@/types/agent";
import { AgentForm } from "./AgentForm";
import { AgentCard } from "./AgentCard";

const PAGE_SIZE = 8;

function agentMatchesQuery(agent: Agent, query: string): boolean {
  const haystack = [agent.name, agent.description ?? "", ...(agent.tool_names ?? [])]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

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
    isGeneratingPrompt,
    formData,
    setFormData,
    handleSetDefault,
    handleStartCreate,
    handleStartEdit,
    handleStartClone,
    handleCancelEdit,
    toggleTool,
    handleSubmit,
    handleGenerateSystemPrompt,
    confirmDelete,
  } = useAgents(token);

  const filterFn = useCallback(
    (agent: Agent, query: string) => agentMatchesQuery(agent, query),
    [],
  );

  const list = useSettingsListControls(agents, {
    pageSize: PAGE_SIZE,
    filter: filterFn,
  });

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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-foreground">Agent 管理</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            自定义系统提示词、工具集与默认知识库，创建多用途的 AI 助手。
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
          {agents.length > 0 && (
            <div className="hidden items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs text-muted-foreground ring-1 ring-inset ring-gray-200 sm:flex">
              共 <span className="font-semibold text-foreground">{agents.length}</span> 个 Agent
            </div>
          )}
          <button
            onClick={handleStartCreate}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground shadow-sm transition-colors hover:opacity-90 sm:w-auto"
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

      {agents.length > 0 && (
        <SettingsListToolbar
          query={list.query}
          onQueryChange={list.setQuery}
          placeholder="搜索 Agent 名称、说明或工具…"
          totalCount={list.totalCount}
          filteredCount={list.filteredCount}
        />
      )}

      <div className="grid gap-4">
        {agents.length === 0 && !error ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
            <Bot className="mb-3 h-8 w-8 text-muted-foreground/40" />
            <p>暂无自定义 Agent</p>
            <p className="mt-1 text-xs">点击右上角创建新的智能助手</p>
          </div>
        ) : list.filteredCount === 0 ? (
          <SettingsEmptyResults query={list.query} onClear={() => list.setQuery("")} />
        ) : (
          list.paginatedItems.map((agent) => (
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

      <SettingsPagination
        page={list.page}
        totalPages={list.totalPages}
        onPageChange={list.setPage}
        filteredCount={list.filteredCount}
        pageSize={list.pageSize}
      />

      {editingId !== null && (
        <AgentForm
          editingId={editingId}
          formData={formData}
          setFormData={setFormData}
          availableTools={availableTools}
          toolInfos={toolInfos}
          knowledgeBases={knowledgeBases}
          isSubmitting={isSubmitting}
          isGeneratingPrompt={isGeneratingPrompt}
          onGenerateSystemPrompt={handleGenerateSystemPrompt}
          onSubmit={handleSubmit}
          onCancel={handleCancelEdit}
          toggleTool={toggleTool}
        />
      )}
    </div>
  );
}

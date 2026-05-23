/**
 * @fileoverview MCP 服务 Tab：列表、添加表单与删除确认。
 */
"use client";

import { Plus, Plug } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useMcp } from "@/hooks/useMcp";
import { McpAddForm } from "./McpAddForm";
import { McpServerCard } from "./McpServerCard";

/** MCP 服务器管理 Tab。 */
export function McpTab() {
  const { token } = useAuth();
  const {
    servers,
    loading,
    error,
    deleteId,
    setDeleteId,
    isDeleting,
    showAddForm,
    setShowAddForm,
    isSubmitting,
    formData,
    setFormData,
    refreshingId,
    expandedTools,
    handleAddSubmit,
    handleRefresh,
    confirmDelete,
    toggleTools,
  } = useMcp(token);

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
        title="删除 MCP 服务"
        description="确定要删除该 MCP 服务吗？此操作无法撤销。"
        confirmLabel="删除"
        cancelLabel="取消"
        danger
        pending={isDeleting}
        onConfirm={confirmDelete}
        onCancel={() => !isDeleting && setDeleteId(null)}
      />

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">MCP 服务</h2>
          <p className="mt-1 text-sm text-gray-500">
            连接 MCP 服务器（HTTP 远端或 stdio 本地 command，与 Cursor mcp.json 格式兼容），动态扩展大模型能力。
          </p>
        </div>
        {!showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-gray-800"
          >
            <Plus className="h-4 w-4" />
            添加服务
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600">
          加载失败: {error}
        </div>
      )}

      {showAddForm && (
        <McpAddForm
          formData={formData}
          setFormData={setFormData}
          isSubmitting={isSubmitting}
          onSubmit={handleAddSubmit}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      <div className="grid gap-4">
        {!showAddForm && servers.length === 0 && !error ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 py-12 text-center text-sm text-gray-500">
            <Plug className="mb-3 h-8 w-8 text-gray-300" />
            <p>暂无 MCP 服务</p>
            <p className="mt-1 text-xs">点击右上角添加新服务并连接远端工具</p>
          </div>
        ) : (
          servers.map((server) => (
            <McpServerCard
              key={server.id}
              server={server}
              isRefreshing={refreshingId === server.id}
              isExpanded={!!expandedTools[server.id]}
              onRefresh={handleRefresh}
              onDelete={setDeleteId}
              onToggleTools={toggleTools}
            />
          ))
        )}
      </div>
    </div>
  );
}

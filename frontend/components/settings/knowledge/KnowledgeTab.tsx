/**
 * @fileoverview 知识库 Tab：列表、抽屉详情与 CRUD 对话框。
 */
"use client";

import { useState } from "react";
import { Database, Plus } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EditKnowledgeBaseDialog } from "@/components/ui/EditKnowledgeBaseDialog";
import { useKnowledge } from "@/hooks/useKnowledge";
import { KnowledgeBaseCard } from "./KnowledgeBaseCard";
import { KnowledgeDrawer } from "./KnowledgeDrawer";

/** 知识库管理主 Tab。 */
export function KnowledgeTab() {
  const { token } = useAuth();
  const k = useKnowledge(token);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeKbId, setActiveKbId] = useState<string | null>(null);

  const activeKb = k.kbs.find(kb => kb.id === activeKbId) || null;

  const handleOpenDrawer = (id: string) => {
    setActiveKbId(id);
    k.setUploadKbId(id);
    k.setSearchKbId(id);
    // ensure documents are fetched if not already
    if (!k.documentsCache.has(id)) {
      k.toggleExpand(id); // Using the existing hook logic to fetch documents, even if it sets internal expanded state
    }
    setDrawerOpen(true);
  };

  if (k.loading) {
    return (
      <div className="flex justify-center p-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-orange-200 border-t-orange-500" />
      </div>
    );
  }

  return (
    <div className="box-border w-full min-w-0 space-y-6 animate-in fade-in slide-in-from-bottom-2">
      <ConfirmDialog
        open={k.deleteId !== null}
        title="删除知识库"
        description="确定删除该知识库吗？库内向量与元数据将一并删除，且不可恢复。"
        confirmLabel="删除"
        cancelLabel="取消"
        danger
        pending={k.isDeleting}
        onConfirm={k.confirmDelete}
        onCancel={() => !k.isDeleting && k.setDeleteId(null)}
      />

      <ConfirmDialog
        open={k.pendingDeleteDoc !== null}
        title="删除文档"
        description={
          k.pendingDeleteDoc
            ? `确定删除文档「${k.pendingDeleteDoc.doc.filename}」吗？相关向量片段将一并清除。`
            : ""
        }
        confirmLabel="删除"
        cancelLabel="取消"
        danger
        pending={k.deletingDocId !== null}
        onConfirm={() =>
          k.pendingDeleteDoc &&
          k.deleteDocument(
            k.pendingDeleteDoc.kbId,
            k.pendingDeleteDoc.doc.id
          )
        }
        onCancel={() =>
          k.deletingDocId === null && k.setPendingDeleteDoc(null)
        }
      />

      <EditKnowledgeBaseDialog
        open={k.editingKb !== null}
        kb={k.editingKb}
        pending={k.isUpdating}
        onSubmit={(data) =>
          k.editingKb && k.handleUpdate(k.editingKb.id, data)
        }
        onCancel={() => !k.isUpdating && k.setEditingKb(null)}
      />

      <div>
        <h2 className="text-lg font-semibold text-gray-900">知识库</h2>
        <p className="mt-1 text-sm text-gray-500">
          创建个人知识库并上传 PDF、TXT、Markdown 或 Word 文档（.docx），供对话中「检索知识库」工具使用。
        </p>
      </div>

      {k.error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600">
          {k.error}
        </div>
      )}

      <form
        onSubmit={k.handleCreate}
        className="rounded-xl border border-[#e5e5e5] bg-white p-5 shadow-sm"
      >
        <h3 className="text-sm font-medium text-gray-900">新建知识库</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <input
            type="text"
            required
            placeholder="名称 *"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
            value={k.newName}
            onChange={(e) => k.setNewName(e.target.value)}
          />
          <input
            type="text"
            placeholder="说明（可选）"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
            value={k.newDesc}
            onChange={(e) => k.setNewDesc(e.target.value)}
          />
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="submit"
            disabled={k.creating}
            className="flex items-center gap-2 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {k.creating ? "创建中…" : "创建"}
          </button>
        </div>
      </form>

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-gray-900">我的知识库</h3>
        {k.kbs.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 py-12 text-center text-sm text-gray-500">
            <Database className="mb-3 h-8 w-8 text-gray-300" />
            <p>暂无知识库</p>
            <p className="mt-1 text-xs">在上方创建后即可上传文档</p>
          </div>
        ) : (
          <div className="grid w-full min-w-0 gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(280px,_100%),_1fr))]">
            {k.kbs.map((kb) => (
              <KnowledgeBaseCard
                key={kb.id}
                kb={kb}
                onOpen={() => handleOpenDrawer(kb.id)}
                onEdit={() => k.setEditingKb(kb)}
                onDelete={() => k.setDeleteId(kb.id)}
              />
            ))}
          </div>
        )}
      </div>

      <KnowledgeDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        kb={activeKb}
        documents={activeKb ? k.documentsCache.get(activeKb.id) : undefined}
        loadingDocs={activeKb ? (k.docLoading.get(activeKb.id) ?? false) : false}
        deletingDocId={k.deletingDocId}
        onRequestDeleteDoc={(doc) => activeKb && k.setPendingDeleteDoc({ kbId: activeKb.id, doc })}
        fileInputRef={k.fileInputRef}
        ingestJobs={k.ingestJobs}
        onFilesSelected={k.handleFilesSelected}
        onRetry={k.handleRetry}
        searchQuery={k.searchQuery}
        setSearchQuery={k.setSearchQuery}
        searchTopK={k.searchTopK}
        setSearchTopK={k.setSearchTopK}
        searchResults={k.searchResults}
        searching={k.searching}
        hasSearched={k.hasSearched}
        onSearch={() => activeKb && k.searchKb(activeKb.id, k.searchQuery, k.searchTopK)}
      />
    </div>
  );
}

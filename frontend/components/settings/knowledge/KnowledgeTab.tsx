/**
 * @fileoverview 知识库 Tab：列表、抽屉详情与 CRUD 对话框。
 */
"use client";

import { useCallback, useState } from "react";
import { Database, Plus } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "@/contexts/auth-context";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CreateKnowledgeBaseDialog } from "@/components/ui/CreateKnowledgeBaseDialog";
import { EditKnowledgeBaseDialog } from "@/components/ui/EditKnowledgeBaseDialog";
import { SettingsEmptyResults } from "@/components/settings/shell/SettingsEmptyResults";
import { SettingsListToolbar } from "@/components/settings/shell/SettingsListToolbar";
import { SettingsPagination } from "@/components/settings/shell/SettingsPagination";
import { useSettingsListControls } from "@/components/settings/shell/useSettingsListControls";
import { useKnowledge } from "@/hooks/useKnowledge";
import type { KnowledgeBase } from "@/types/knowledge";
import { KnowledgeBaseCard } from "./KnowledgeBaseCard";
import { KnowledgeDrawer } from "./KnowledgeDrawer";

const PAGE_SIZE = 9;

function kbMatchesQuery(kb: KnowledgeBase, query: string): boolean {
  const haystack = [kb.name, kb.description ?? ""].join(" ").toLowerCase();
  return haystack.includes(query);
}

/** 知识库管理主 Tab。 */
export function KnowledgeTab() {
  const { token } = useAuth();
  const k = useKnowledge(token);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeKbId, setActiveKbId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const handleCreateSubmit = useCallback(
    async (data: { name: string; description: string }) => {
      const ok = await k.createKnowledgeBase(data);
      if (ok) setCreateOpen(false);
    },
    [k.createKnowledgeBase],
  );

  const activeKb = k.kbs.find((kb) => kb.id === activeKbId) || null;

  const filterFn = useCallback(
    (kb: KnowledgeBase, query: string) => kbMatchesQuery(kb, query),
    [],
  );

  const list = useSettingsListControls(k.kbs, {
    pageSize: PAGE_SIZE,
    filter: filterFn,
  });

  const handleOpenDrawer = (id: string) => {
    setActiveKbId(id);
    k.setUploadKbId(id);
    k.setSearchKbId(id);
    if (!k.documentsCache.has(id)) {
      k.toggleExpand(id);
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
          k.deleteDocument(k.pendingDeleteDoc.kbId, k.pendingDeleteDoc.doc.id)
        }
        onCancel={() => k.deletingDocId === null && k.setPendingDeleteDoc(null)}
      />

      <EditKnowledgeBaseDialog
        open={k.editingKb !== null}
        kb={k.editingKb}
        pending={k.isUpdating}
        onSubmit={(data) => k.editingKb && k.handleUpdate(k.editingKb.id, data)}
        onCancel={() => !k.isUpdating && k.setEditingKb(null)}
      />

      <CreateKnowledgeBaseDialog
        open={createOpen}
        pending={k.creating}
        onSubmit={(data) => void handleCreateSubmit(data)}
        onCancel={() => !k.creating && setCreateOpen(false)}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-foreground">知识库</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            创建个人知识库并上传 PDF、TXT、Markdown 或 Word 文档（.docx），供对话中「检索知识库」工具使用。
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="flex w-full shrink-0 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted sm:w-auto"
        >
          <Plus className="h-4 w-4" />
          新建知识库
        </button>
      </div>

      {k.error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600">{k.error}</div>
      )}

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-foreground">我的知识库</h3>

        {k.kbs.length > 0 && (
          <SettingsListToolbar
            query={list.query}
            onQueryChange={list.setQuery}
            placeholder="搜索知识库名称或说明…"
            totalCount={list.totalCount}
            filteredCount={list.filteredCount}
          />
        )}

        {k.kbs.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
            <Database className="mb-3 h-8 w-8 text-muted-foreground/40" />
            <p>暂无知识库</p>
            <p className="mt-1 text-xs">创建后即可上传文档</p>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              创建知识库
            </button>
          </div>
        ) : list.filteredCount === 0 ? (
          <SettingsEmptyResults query={list.query} onClear={() => list.setQuery("")} />
        ) : (
          <div
            className={clsx(
              "grid w-full min-w-0 gap-4",
              "[grid-template-columns:repeat(auto-fit,minmax(min(280px,_100%),_1fr))]",
            )}
          >
            {list.paginatedItems.map((kb) => (
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

        <SettingsPagination
          page={list.page}
          totalPages={list.totalPages}
          onPageChange={list.setPage}
          filteredCount={list.filteredCount}
          pageSize={list.pageSize}
        />
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

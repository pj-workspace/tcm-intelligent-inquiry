/**
 * @fileoverview 知识库设置页聚合 Hook：组合 bases / docs / upload / search 子模块。
 */
"use client";

import { API_BASE, apiHeaders, parseApiError } from "@/lib/api";
import { toast } from "sonner";
import { useKnowledgeBases } from "@/hooks/knowledge/useKnowledgeBases";
import { useKnowledgeDocs } from "@/hooks/knowledge/useKnowledgeDocs";
import { useKnowledgeSearch } from "@/hooks/knowledge/useKnowledgeSearch";
import { useKnowledgeUpload } from "@/hooks/knowledge/useKnowledgeUpload";

// =====================================================================
// useKnowledge：聚合知识库相关的所有客户端状态与异步行为。
// 子模块：useKnowledgeBases / useKnowledgeUpload / useKnowledgeDocs / useKnowledgeSearch
// =====================================================================

/** 聚合知识库 CRUD、文档列表、异步入库与向量检索的单一入口 Hook。 */
export function useKnowledge(token: string | null) {
  const bases = useKnowledgeBases(token);
  const docs = useKnowledgeDocs(token, bases.fetchKbs);
  const search = useKnowledgeSearch(token);
  const upload = useKnowledgeUpload(token, {
    fetchKbs: bases.fetchKbs,
    invalidateDocsForKb: docs.invalidateDocsForKb,
    setError: bases.setError,
  });

  /** 确认删除知识库并联动清理上传/检索选中态。 */
  const confirmDelete = async () => {
    if (!token || !bases.deleteId) return;
    bases.setIsDeleting(true);
    try {
      const res = await fetch(`${API_BASE}/api/knowledge/${bases.deleteId}`, {
        method: "DELETE",
        headers: apiHeaders(token),
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      const deletedId = bases.deleteId;
      if (upload.uploadKbId === deletedId) upload.setUploadKbId("");
      if (search.searchKbId === deletedId) search.setSearchKbId("");
      docs.removeKbFromDocs(deletedId);
      bases.setDeleteId(null);
      await bases.fetchKbs();
      toast.success("知识库已删除");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    } finally {
      bases.setIsDeleting(false);
    }
  };

  return {
    kbs: bases.kbs,
    loading: bases.loading,
    error: bases.error,
    creating: bases.creating,
    newName: bases.newName,
    setNewName: bases.setNewName,
    newDesc: bases.newDesc,
    setNewDesc: bases.setNewDesc,
    handleCreate: bases.handleCreate,
    deleteId: bases.deleteId,
    setDeleteId: bases.setDeleteId,
    isDeleting: bases.isDeleting,
    confirmDelete,
    editingKb: bases.editingKb,
    setEditingKb: bases.setEditingKb,
    isUpdating: bases.isUpdating,
    handleUpdate: bases.handleUpdate,
    uploadKbId: upload.uploadKbId,
    setUploadKbId: upload.setUploadKbId,
    ingestJobs: upload.ingestJobs,
    fileInputRef: upload.fileInputRef,
    handleFilesSelected: upload.handleFilesSelected,
    handleRetry: upload.handleRetry,
    expandedKbId: docs.expandedKbId,
    documentsCache: docs.documentsCache,
    docLoading: docs.docLoading,
    deletingDocId: docs.deletingDocId,
    pendingDeleteDoc: docs.pendingDeleteDoc,
    setPendingDeleteDoc: docs.setPendingDeleteDoc,
    toggleExpand: docs.toggleExpand,
    fetchDocuments: docs.fetchDocuments,
    deleteDocument: docs.deleteDocument,
    searchKbId: search.searchKbId,
    setSearchKbId: search.setSearchKbId,
    searchQuery: search.searchQuery,
    setSearchQuery: search.setSearchQuery,
    searchTopK: search.searchTopK,
    setSearchTopK: search.setSearchTopK,
    searchResults: search.searchResults,
    searching: search.searching,
    hasSearched: search.hasSearched,
    lastSearchedKbId: search.lastSearchedKbId,
    searchKb: search.searchKb,
  };
}

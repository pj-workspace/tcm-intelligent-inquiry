/**
 * @fileoverview 知识库文档列表：展开加载、缓存与单文档删除。
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE, apiHeaders, parseApiError } from "@/lib/api";
import { toast } from "sonner";
import type { KnowledgeDocument } from "@/types/knowledge";

/** 管理某知识库下的文档展开、缓存与删除确认。 */
export function useKnowledgeDocs(
  token: string | null,
  fetchKbs: () => Promise<void>
) {
  const [expandedKbId, setExpandedKbId] = useState<string | null>(null);
  const [documentsCache, setDocumentsCache] = useState<
    Map<string, KnowledgeDocument[]>
  >(new Map());
  const [docLoading, setDocLoading] = useState<Map<string, boolean>>(new Map());
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [pendingDeleteDoc, setPendingDeleteDoc] = useState<{
    kbId: string;
    doc: KnowledgeDocument;
  } | null>(null);
  const inFlightDocsRef = useRef<Set<string>>(new Set());

  const invalidateDocsForKb = useCallback((kbId: string) => {
    setDocumentsCache((prev) => {
      if (!prev.has(kbId)) return prev;
      const next = new Map(prev);
      next.delete(kbId);
      return next;
    });
  }, []);

  const removeKbFromDocs = useCallback((kbId: string) => {
    setDocumentsCache((prev) => {
      if (!prev.has(kbId)) return prev;
      const next = new Map(prev);
      next.delete(kbId);
      return next;
    });
    setExpandedKbId((prev) => (prev === kbId ? null : prev));
  }, []);

  const fetchDocuments = useCallback(
    async (kbId: string) => {
      if (!token) return;
      if (inFlightDocsRef.current.has(kbId)) return;
      inFlightDocsRef.current.add(kbId);
      setDocLoading((prev) => {
        const m = new Map(prev);
        m.set(kbId, true);
        return m;
      });
      try {
        const res = await fetch(
          `${API_BASE}/api/knowledge/${kbId}/documents`,
          { headers: apiHeaders(token) }
        );
        if (!res.ok) throw new Error(await parseApiError(res));
        const data = (await res.json()) as
          | KnowledgeDocument[]
          | { documents?: KnowledgeDocument[] };
        const docs = Array.isArray(data) ? data : data.documents ?? [];
        setDocumentsCache((prev) => {
          const m = new Map(prev);
          m.set(kbId, docs);
          return m;
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "获取文档失败");
      } finally {
        inFlightDocsRef.current.delete(kbId);
        setDocLoading((prev) => {
          const m = new Map(prev);
          m.set(kbId, false);
          return m;
        });
      }
    },
    [token]
  );

  const toggleExpand = useCallback((kbId: string) => {
    setExpandedKbId((prev) => (prev === kbId ? null : kbId));
  }, []);

  useEffect(() => {
    if (!expandedKbId) return;
    if (documentsCache.has(expandedKbId)) return;
    if (inFlightDocsRef.current.has(expandedKbId)) return;
    void fetchDocuments(expandedKbId);
  }, [expandedKbId, documentsCache, fetchDocuments]);

  const deleteDocument = useCallback(
    async (kbId: string, docId: string) => {
      if (!token) return;
      setDeletingDocId(docId);
      try {
        const res = await fetch(
          `${API_BASE}/api/knowledge/${kbId}/documents/${docId}`,
          {
            method: "DELETE",
            headers: apiHeaders(token),
          }
        );
        if (!res.ok) throw new Error(await parseApiError(res));
        setDocumentsCache((prev) => {
          const list = prev.get(kbId);
          if (!list) return prev;
          const m = new Map(prev);
          m.set(
            kbId,
            list.filter((d) => d.id !== docId)
          );
          return m;
        });
        setPendingDeleteDoc(null);
        await fetchKbs();
        toast.success("文档已删除");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "删除文档失败");
      } finally {
        setDeletingDocId(null);
      }
    },
    [token, fetchKbs]
  );

  return {
    expandedKbId,
    setExpandedKbId,
    documentsCache,
    docLoading,
    deletingDocId,
    pendingDeleteDoc,
    setPendingDeleteDoc,
    toggleExpand,
    fetchDocuments,
    deleteDocument,
    invalidateDocsForKb,
    removeKbFromDocs,
  };
}

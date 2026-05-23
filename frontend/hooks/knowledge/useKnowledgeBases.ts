/**
 * @fileoverview 知识库列表 CRUD 与编辑态管理。
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { API_BASE, apiHeaders, apiJsonHeaders, parseApiError } from "@/lib/api";
import { toast } from "sonner";
import type { KnowledgeBase } from "@/types/knowledge";

/** 加载并管理用户知识库列表、创建与 PATCH 更新。 */
export function useKnowledgeBases(token: string | null) {
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingKb, setEditingKb] = useState<KnowledgeBase | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const fetchKbs = useCallback(async () => {
    if (!token) return;
    const res = await fetch(`${API_BASE}/api/knowledge`, {
      headers: apiHeaders(token),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    const data = (await res.json()) as { knowledge_bases?: KnowledgeBase[] };
    setKbs(data.knowledge_bases || []);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let mounted = true;
    (async () => {
      try {
        await fetchKbs();
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [token, fetchKbs]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/knowledge`, {
        method: "POST",
        headers: apiJsonHeaders(token),
        body: JSON.stringify({
          name: newName.trim(),
          description: newDesc.trim(),
        }),
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      setNewName("");
      setNewDesc("");
      await fetchKbs();
      toast.success("知识库已创建");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  };

  const handleUpdate = useCallback(
    async (
      kbId: string,
      data: { name?: string; description?: string }
    ) => {
      if (!token) return;
      const payload: Record<string, string> = {};
      if (data.name !== undefined) payload.name = data.name;
      if (data.description !== undefined) payload.description = data.description;
      if (Object.keys(payload).length === 0) {
        setEditingKb(null);
        return;
      }
      setIsUpdating(true);
      try {
        const res = await fetch(`${API_BASE}/api/knowledge/${kbId}`, {
          method: "PATCH",
          headers: apiJsonHeaders(token),
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(await parseApiError(res));
        await fetchKbs();
        setEditingKb(null);
        toast.success("知识库已更新");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "更新失败");
      } finally {
        setIsUpdating(false);
      }
    },
    [token, fetchKbs]
  );

  return {
    kbs,
    loading,
    error,
    setError,
    creating,
    newName,
    setNewName,
    newDesc,
    setNewDesc,
    handleCreate,
    deleteId,
    setDeleteId,
    isDeleting,
    setIsDeleting,
    editingKb,
    setEditingKb,
    isUpdating,
    handleUpdate,
    fetchKbs,
  };
}

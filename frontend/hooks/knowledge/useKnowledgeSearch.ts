"use client";

import { useCallback, useState } from "react";
import { API_BASE, apiJsonHeaders, parseApiError } from "@/lib/api";
import { toast } from "sonner";
import type { SearchResult } from "@/types/knowledge";

export function useKnowledgeSearch(token: string | null) {
  const [searchKbId, setSearchKbId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchTopK, setSearchTopK] = useState(5);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [lastSearchedKbId, setLastSearchedKbId] = useState("");

  const searchKb = useCallback(
    async (kbId: string, query: string, topK: number) => {
      if (!token) return;
      if (!kbId) {
        toast.warning("请先选择要检索的知识库");
        return;
      }
      const q = query.trim();
      if (!q) {
        toast.warning("请输入查询语句");
        return;
      }
      setSearching(true);
      try {
        const res = await fetch(`${API_BASE}/api/knowledge/${kbId}/search`, {
          method: "POST",
          headers: apiJsonHeaders(token),
          body: JSON.stringify({ query: q, top_k: topK }),
        });
        if (!res.ok) throw new Error(await parseApiError(res));
        const data = (await res.json()) as {
          results?: SearchResult[];
          query?: string;
        };
        setSearchResults(data.results ?? []);
        setLastSearchedKbId(kbId);
        setHasSearched(true);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "检索失败");
      } finally {
        setSearching(false);
      }
    },
    [token]
  );

  return {
    searchKbId,
    setSearchKbId,
    searchQuery,
    setSearchQuery,
    searchTopK,
    setSearchTopK,
    searchResults,
    searching,
    hasSearched,
    lastSearchedKbId,
    searchKb,
  };
}

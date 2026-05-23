/**
 * @fileoverview 对话页 Agent 下拉目录：内存缓存与跨页变更事件同步。
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE, apiHeaders } from "@/lib/api";
import type { Agent } from "@/types/agent";

let cachedAgents: Agent[] | null = null;
let cachedForToken: string | null = null;

/** 设置页增删改 Agent 后派发，对话页下拉等会重新拉列表 */
export const CHAT_AGENTS_CATALOG_CHANGED_EVENT = "tcm-chat-agents-catalog-changed";

/** 清空 Agent 目录内存缓存（token 变更或设置页变更后）。 */
export function invalidateChatAgentsCatalog(): void {
  cachedAgents = null;
  cachedForToken = null;
}

/** 使缓存失效并派发 `CHAT_AGENTS_CATALOG_CHANGED_EVENT` 通知订阅方刷新。 */
export function notifyChatAgentsCatalogChanged(): void {
  invalidateChatAgentsCatalog();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CHAT_AGENTS_CATALOG_CHANGED_EVENT));
  }
}

/** 拉取并缓存当前用户的 Agent 列表，监听设置页变更事件。 */
export function useChatAgentsCatalog(token: string | null) {
  const [agents, setAgents] = useState<Agent[]>(() =>
    token && cachedForToken === token && cachedAgents ? cachedAgents : [],
  );
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!token?.trim()) {
      setAgents([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/agents`, { headers: apiHeaders(token) });
      if (!res.ok) throw new Error("Failed to fetch agents");
      const data = (await res.json()) as { agents?: Agent[] };
      const list = Array.isArray(data.agents) ? data.agents : [];
      cachedAgents = list;
      cachedForToken = token;
      if (mountedRef.current) setAgents(list);
    } catch {
      if (mountedRef.current) setAgents([]);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    mountedRef.current = true;
    if (!token) {
      setAgents([]);
      return () => {
        mountedRef.current = false;
      };
    }
    if (cachedForToken === token && cachedAgents) {
      setAgents(cachedAgents);
    } else {
      void refresh();
    }

    const onCatalogChanged = () => {
      void refresh();
    };
    window.addEventListener(CHAT_AGENTS_CATALOG_CHANGED_EVENT, onCatalogChanged);

    return () => {
      mountedRef.current = false;
      window.removeEventListener(CHAT_AGENTS_CATALOG_CHANGED_EVENT, onCatalogChanged);
    };
  }, [token, refresh]);

  return { agents, loading, refresh };
}

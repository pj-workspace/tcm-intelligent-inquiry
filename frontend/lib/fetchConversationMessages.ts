/**
 * @fileoverview 拉取会话消息（分页 / 全量）。
 */
import { API_BASE } from "@/lib/api";
import type { ApiMessageRow } from "@/types/chat";

/** 默认首屏与向上翻页每页条数（原始 message 行；一轮对话常占 2–4 行） */
export const CHAT_MESSAGE_PAGE_SIZE = 16;

export type ConversationMessagesPage = {
  messages: ApiMessageRow[];
  has_more: boolean;
};

type FetchConversationMessagesOpts = {
  token: string;
  conversationId: string;
  signal?: AbortSignal;
  /** 向上翻页：取该 id 之前更早的消息 */
  before?: string;
  /** 导出等场景拉全量 */
  loadAll?: boolean;
  limit?: number;
};

/** GET /api/chat/conversations/{id}/messages */
export async function fetchConversationMessages({
  token,
  conversationId,
  signal,
  before,
  loadAll = false,
  limit = CHAT_MESSAGE_PAGE_SIZE,
}: FetchConversationMessagesOpts): Promise<ConversationMessagesPage> {
  const params = new URLSearchParams();
  if (loadAll) {
    params.set("load_all", "true");
  } else {
    params.set("limit", String(limit));
    if (before?.trim()) params.set("before", before.trim());
  }

  const res = await fetch(
    `${API_BASE}/api/chat/conversations/${encodeURIComponent(conversationId)}/messages?${params}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    },
  );
  if (res.status === 404) {
    return { messages: [], has_more: false };
  }
  if (!res.ok) throw new Error("Failed to fetch messages");

  const data = (await res.json()) as ConversationMessagesPage;
  if (!data || !Array.isArray(data.messages)) {
    return { messages: [], has_more: false };
  }
  return {
    messages: data.messages,
    has_more: Boolean(data.has_more),
  };
}

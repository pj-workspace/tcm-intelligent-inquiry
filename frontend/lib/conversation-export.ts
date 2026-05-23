/**
 * @fileoverview 从服务端拉取会话并触发 Markdown 文件下载。
 */

import { API_BASE, apiJsonHeaders } from "@/lib/api";
import {
  conversationToMarkdown,
  groupMessagesIntoTraces,
  mapApiRowToMessage,
  sanitizeDownloadBasename,
} from "@/lib/chatUtils";
import type { ApiMessageRow } from "@/types/chat";

/** 拉取某会话消息并下载为 Markdown（与首页导出逻辑一致） */
export async function downloadConversationMarkdown(
  token: string,
  conversationId: string,
  title: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/chat/conversations/${conversationId}/messages`, {
    headers: apiJsonHeaders(token),
  });
  if (!res.ok) throw new Error("无法加载会话消息");
  const data = (await res.json()) as ApiMessageRow[];
  if (!Array.isArray(data)) throw new Error("消息格式无效");
  const messages = groupMessagesIntoTraces(data.map(mapApiRowToMessage));
  const md = conversationToMarkdown(title, messages);
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${sanitizeDownloadBasename(title)}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

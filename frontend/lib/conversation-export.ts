/**
 * @fileoverview 从服务端拉取会话并触发 Markdown 文件下载。
 */

import {
  conversationToMarkdown,
  groupMessagesIntoTraces,
  mapApiRowToMessage,
  sanitizeDownloadBasename,
} from "@/lib/chatUtils";
import { fetchConversationMessages } from "@/lib/fetchConversationMessages";

/** 拉取某会话消息并下载为 Markdown（与首页导出逻辑一致） */
export async function downloadConversationMarkdown(
  token: string,
  conversationId: string,
  title: string,
): Promise<void> {
  const page = await fetchConversationMessages({
    token,
    conversationId,
    loadAll: true,
  });
  const messages = groupMessagesIntoTraces(page.messages.map(mapApiRowToMessage));
  const md = conversationToMarkdown(title, messages);
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${sanitizeDownloadBasename(title)}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * @fileoverview 聊天区 URL 解析与构建（/chat、/chat/[id]、/chat/folder/[groupId]）。
 */

/** 宽松 UUID（与后端 conversations.id 形态一致） */
const UUID_LIKE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `parseChatPathname` 的判别联合结果。 */
export type ParsedChatPath =
  | { kind: "new" }
  | { kind: "conversation"; conversationId: string }
  | { kind: "folder"; groupId: string }
  | { kind: "invalid" };

/** 规范化 pathname：去尾斜杠，空路径为 `/`。 */
export function normalizePathname(pathname: string): string {
  const p = pathname.trim();
  if (!p || p === "/") return "/";
  return p.replace(/\/+$/, "") || "/";
}

/** 判断 URL 段是否为合法会话/文件夹 UUID。 */
export function isConversationIdSegment(segment: string): boolean {
  const s = segment.trim();
  return s.length > 0 && !s.includes("/") && UUID_LIKE.test(s);
}

/** 解析聊天相关 pathname 为结构化路由语义。 */
export function parseChatPathname(pathname: string): ParsedChatPath {
  const p = normalizePathname(pathname);
  if (p === "/chat") return { kind: "new" };
  if (p.startsWith("/chat/folder")) {
    const rest = p.slice("/chat/folder".length);
    if (rest === "") return { kind: "invalid" };
    const gid = rest.startsWith("/") ? rest.slice(1) : rest;
    if (!gid || gid.includes("/")) return { kind: "invalid" };
    if (!isConversationIdSegment(gid)) return { kind: "invalid" };
    return { kind: "folder", groupId: gid };
  }
  if (p.startsWith("/chat/")) {
    const seg = p.slice("/chat/".length);
    if (!seg || seg.includes("/")) return { kind: "invalid" };
    if (!isConversationIdSegment(seg)) return { kind: "invalid" };
    return { kind: "conversation", conversationId: seg };
  }
  return { kind: "invalid" };
}

/** 新建对话页路径 `/chat`。 */
export function chatPathNew(): string {
  return "/chat";
}

/** 指定会话详情页路径。 */
export function chatPathConversation(conversationId: string): string {
  const id = conversationId.trim();
  return `/chat/${encodeURIComponent(id)}`;
}

/** 指定文件夹工作台路径。 */
export function chatPathFolder(groupId: string): string {
  const id = groupId.trim();
  return `/chat/folder/${encodeURIComponent(id)}`;
}

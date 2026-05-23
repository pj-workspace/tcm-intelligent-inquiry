/**
 * @fileoverview 匿名用户会话列表的 localStorage 持久化（登录前无服务端列表 API）。
 */

/** localStorage 中缓存的单条匿名会话元数据。 */
export type StoredConversation = {
  id: string;
  title: string;
  secret: string;
  updatedAt: number;
};

const LIST_KEY = "tcm_conversation_list";

/** 读取本地会话列表；解析失败或非数组时返回空数组。 */
export function readConversationList(): StoredConversation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LIST_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is StoredConversation =>
        typeof x === "object" &&
        x !== null &&
        "id" in x &&
        "secret" in x &&
        typeof (x as StoredConversation).id === "string" &&
        typeof (x as StoredConversation).secret === "string"
    );
  } catch {
    return [];
  }
}

/** 将完整会话列表写回 localStorage。 */
export function writeConversationList(items: StoredConversation[]): void {
  localStorage.setItem(LIST_KEY, JSON.stringify(items));
}

/**
 * 新建或更新会话。
 * @param title 传入时设置标题（新会话首句）；不传则保留已有标题，只更新 secret / 时间。
 */
export function upsertConversation(
  id: string,
  secret: string,
  title?: string
): void {
  const now = Date.now();
  const list = readConversationList();
  const idx = list.findIndex((c) => c.id === id);
  if (idx === -1) {
    const t = (title ?? "新对话").trim().slice(0, 80) || "新对话";
    list.unshift({ id, secret, title: t, updatedAt: now });
  } else {
    const nextTitle =
      title !== undefined
        ? title.trim().slice(0, 80) || list[idx].title
        : list[idx].title;
    list[idx] = {
      ...list[idx],
      secret,
      title: nextTitle,
      updatedAt: now,
    };
  }
  list.sort((a, b) => b.updatedAt - a.updatedAt);
  writeConversationList(list);
}

/** 将会话置顶到列表头部（仅更新 updatedAt）。 */
export function touchConversation(id: string): void {
  const list = readConversationList();
  const idx = list.findIndex((c) => c.id === id);
  if (idx === -1) return;
  list[idx] = { ...list[idx], updatedAt: Date.now() };
  list.sort((a, b) => b.updatedAt - a.updatedAt);
  writeConversationList(list);
}

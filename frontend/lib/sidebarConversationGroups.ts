import type { ServerConversation } from "@/types/chat";

export type SidebarConversationSection = {
  id: string;
  label: string;
  items: ServerConversation[];
};

const MS_PER_DAY = 86_400_000;

/** 侧栏时间分段标签（对齐 Cursor：Today / Yesterday / Last 7 / Last 30 / Older） */
export type SidebarTimeBucket =
  | "today"
  | "yesterday"
  | "last7"
  | "last30"
  | "older";

const TIME_BUCKET_META: Record<
  SidebarTimeBucket,
  { id: SidebarTimeBucket; label: string }
> = {
  today: { id: "today", label: "今天" },
  yesterday: { id: "yesterday", label: "昨天" },
  last7: { id: "last7", label: "近 7 天" },
  last30: { id: "last30", label: "近 30 天" },
  older: { id: "older", label: "更早" },
};

const TIME_BUCKET_ORDER: SidebarTimeBucket[] = [
  "today",
  "yesterday",
  "last7",
  "last30",
  "older",
];

function localMidnightMs(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** 按本地日历天计算与今天相差几天；无效日期归入「更早」 */
export function sidebarTimeBucketForConversation(
  createdAt: string | undefined,
  now = new Date(),
): SidebarTimeBucket {
  if (!createdAt) return "older";
  const parsed = new Date(createdAt);
  if (Number.isNaN(parsed.getTime())) return "older";

  const diffDays = Math.round(
    (localMidnightMs(now) - localMidnightMs(parsed)) / MS_PER_DAY,
  );
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return "last7";
  if (diffDays < 30) return "last30";
  return "older";
}

/**
 * 侧栏「聊天」列表分段：
 * - 置顶会话单独一节（保持 pin 顺序）
 * - 其余按 created_at 落入时间桶，桶内保持输入顺序
 */
export function buildSidebarConversationSections(
  conversations: ServerConversation[],
  pinnedIds: string[],
): SidebarConversationSection[] {
  const pinOrder = pinnedIds.filter((id) =>
    conversations.some((c) => c.id === id),
  );
  const pinSet = new Set(pinOrder);
  const pinnedItems = pinOrder
    .map((id) => conversations.find((c) => c.id === id))
    .filter((c): c is ServerConversation => c != null);
  const unpinned = conversations.filter((c) => !pinSet.has(c.id));

  const buckets: Record<SidebarTimeBucket, ServerConversation[]> = {
    today: [],
    yesterday: [],
    last7: [],
    last30: [],
    older: [],
  };
  for (const conv of unpinned) {
    buckets[sidebarTimeBucketForConversation(conv.created_at)].push(conv);
  }

  const sections: SidebarConversationSection[] = [];
  if (pinnedItems.length > 0) {
    sections.push({ id: "pinned", label: "置顶", items: pinnedItems });
  }
  for (const bucket of TIME_BUCKET_ORDER) {
    const items = buckets[bucket];
    if (items.length === 0) continue;
    const meta = TIME_BUCKET_META[bucket];
    sections.push({ id: meta.id, label: meta.label, items });
  }
  return sections;
}

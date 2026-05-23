/**
 * @fileoverview 全局会话搜索模态：按日期分组过滤与键盘导航。
 */
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, SquarePen } from "lucide-react";
import clsx from "clsx";
import { uiModalBackdrop, uiModalPanel } from "@/lib/ui-motion";

export type SearchableConversation = {
  id: string;
  title: string;
  created_at?: string;
};

type Props = {
  open: boolean;
  conversations: SearchableConversation[];
  onClose: () => void;
  onSelect: (id: string) => void;
  onNewChat: () => void;
};

type Group = { label: string; items: SearchableConversation[] };

/** 按本地日历天分组 */
function getGroup(dateStr: string | undefined): string {
  if (!dateStr) return "更早";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "更早";
  const now = new Date();
  // 截断到当地日期零点，再计算天差
  const dMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diffDays = Math.round((nowMidnight - dMidnight) / 86400000);
  if (diffDays === 0) return "今天";
  if (diffDays < 7) return "本周";
  if (diffDays < 30) return "本月";
  return "更早";
}

const GROUP_ORDER = ["今天", "本周", "本月", "更早"];

/** 将会话列表按本地日历天分组（今天/本周/本月/更早）。 */
function groupConversations(convs: SearchableConversation[]): Group[] {
  const map: Record<string, SearchableConversation[]> = {};
  for (const c of convs) {
    const label = getGroup(c.created_at);
    if (!map[label]) map[label] = [];
    map[label].push(c);
  }
  return GROUP_ORDER.filter((l) => map[l]?.length).map((label) => ({
    label,
    items: map[label],
  }));
}

/** 会话搜索弹窗：模糊匹配标题并按日期分组展示。 */
export function ConversationSearchModal({
  open,
  conversations,
  onClose,
  onSelect,
  onNewChat,
}: Props) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === overlayRef.current) onClose();
    },
    [onClose]
  );

  const filtered = query.trim()
    ? conversations.filter((c) =>
        c.title.toLowerCase().includes(query.trim().toLowerCase())
      )
    : conversations;

  const groups = query.trim()
    ? [{ label: "", items: filtered }]
    : groupConversations(filtered);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="conv-search-overlay"
          ref={overlayRef}
          onClick={handleOverlayClick}
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-[12vh] backdrop-blur-[2px]"
          {...uiModalBackdrop}
        >
          <motion.div
            key="conv-search-panel"
            className="mx-4 flex max-h-[70vh] w-full max-w-[34rem] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            {...uiModalPanel}
          >
        {/* 搜索栏 */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索对话"
            className="flex-1 bg-transparent text-gray-800 placeholder-gray-400 text-sm outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 内容列表 */}
        <div className="overflow-y-auto no-scrollbar py-1.5">
          {/* 新建对话 */}
          <div className="px-2 pb-1">
            <button
              type="button"
              onClick={() => { onNewChat(); onClose(); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <SquarePen className="w-4 h-4 text-gray-500 shrink-0" />
              <span className="font-medium">新建对话</span>
            </button>
          </div>

          {/* 分组列表 */}
          {groups.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-400">
              没有找到匹配的对话
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.label} className="px-2">
                {group.label && (
                  <div className="px-3 pt-2 pb-1 text-xs font-semibold text-gray-400">
                    {group.label}
                  </div>
                )}
                {group.items.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { onSelect(c.id); onClose(); }}
                    className={clsx(
                      "w-full flex items-center px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors text-left"
                    )}
                  >
                    <span className="truncate">{c.title || "未命名"}</span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

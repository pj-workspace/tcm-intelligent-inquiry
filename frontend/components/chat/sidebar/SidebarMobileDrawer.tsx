/**
 * @fileoverview 移动端侧栏抽屉：overlay + 自左滑入，复用 Sidebar drawer 模式。
 */
"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import { uiDrawerSlide, uiModalBackdrop } from "@/lib/ui-motion";
import { Sidebar, type SidebarFilter } from "./Sidebar";
import type { ConversationFolder, ServerConversation } from "@/types/chat";

type SidebarMobileDrawerProps = {
  open: boolean;
  onClose: () => void;
  folders: ConversationFolder[];
  conversationsFull: ServerConversation[];
  displayedConversations: ServerConversation[];
  activeId: string | null;
  sidebarFilter: SidebarFilter;
  onSidebarFilterChange: (f: SidebarFilter) => void;
  onNewChat: () => void;
  onSelect: (id: string) => void;
  onDelete?: (id: string) => void;
  onRenameRequest: (id: string, currentTitle: string) => void;
  onExportConversation: (id: string, title: string) => void;
  onTogglePin: (id: string) => void;
  onMoveToGroup: (conversationId: string, groupId: string | null) => void;
  onCreateFolder: () => void;
  onRenameFolder?: (groupId: string, currentName: string) => void;
  onDeleteFolder?: (groupId: string) => void;
  pinnedIds: string[];
  batchMode: boolean;
  onToggleBatchMode: () => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAllDisplayed: () => void;
  onClearBatchSelection?: () => void;
  onBulkDelete?: () => void;
  bulkDeletePending?: boolean;
  streamBusy?: boolean;
  isGeneratingTitle?: boolean;
  onOpenSearch?: () => void;
  movePendingId?: string | null;
  onPrefetchConversation?: (id: string) => void;
  conversationsLoading?: boolean;
};

/** 移动端侧栏 overlay 抽屉（仅 md 以下渲染）。 */
export function SidebarMobileDrawer({
  open,
  onClose,
  onSelect,
  onOpenSearch,
  onNewChat,
  onSidebarFilterChange,
  ...sidebarProps
}: SidebarMobileDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <div key="sidebar-mobile-drawer" className="fixed inset-0 z-40 md:hidden">
          <motion.button
            type="button"
            aria-label="关闭侧栏"
            className="absolute inset-0 bg-black/30 backdrop-blur-[1px]"
            onClick={onClose}
            {...uiModalBackdrop}
          />
          <motion.aside
            className="absolute inset-y-0 left-0 flex w-[min(280px,88vw)] flex-col overflow-hidden border-r border-[#e5e5e5] bg-[#f9f9f8] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] shadow-xl"
            {...uiDrawerSlide}
          >
            <Sidebar
              {...sidebarProps}
              variant="drawer"
              onMobileClose={onClose}
              onSelect={(id) => {
                onSelect(id);
                onClose();
              }}
              onNewChat={() => {
                onNewChat();
                onClose();
              }}
              onOpenSearch={() => {
                onOpenSearch?.();
                onClose();
              }}
              onSidebarFilterChange={(filter) => {
                onSidebarFilterChange(filter);
                onClose();
              }}
            />
          </motion.aside>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

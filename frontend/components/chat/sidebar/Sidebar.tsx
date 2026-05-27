/**
 * @fileoverview 对话侧栏：分组筛选、会话列表、批量管理与搜索入口。
 */
"use client";

import Link from "next/link";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Folder,
  LogIn,
  MoreVertical,
  PanelLeftClose,
  Plus,
  Search,
  Settings,
  Pencil,
  Trash2,
  Loader2,
  CheckSquare,
  X,
} from "lucide-react";
import clsx from "clsx";
import { useCallback, useMemo, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { buildSidebarConversationSections } from "@/lib/sidebarConversationGroups";
import type { ConversationFolder, ServerConversation } from "@/types/chat";
import { SidebarBatchBar } from "./SidebarBatchBar";
import { SidebarConversationRow } from "./SidebarConversationRow";

/** 非批量模式下，每段时间分组默认展示条数；超出显示「更多」 */
const SECTION_PREVIEW_LIMIT = 8;

/** 时间分段标题：比「聊天」区块标题更轻、更小 */
const TIME_SECTION_LABEL_CLASS =
  "px-2 pt-1 pb-1 text-[11px] font-medium text-muted-foreground/80";

export type SidebarConversation = ServerConversation;

export type SidebarFilter = "__ungrouped__" | string;

type SidebarProps = {
  folders: ConversationFolder[];
  conversationsFull: ServerConversation[];
  /** 已按置顶与当前筛选处理后的列表 */
  displayedConversations: ServerConversation[];
  activeId: string | null;
  /** 当前列表范围：未分组 或 某分组 id */
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
  /** 分组行 ⋮ */
  onRenameFolder?: (groupId: string, currentName: string) => void;
  onDeleteFolder?: (groupId: string) => void;
  pinnedIds: string[];
  batchMode: boolean;
  onToggleBatchMode: () => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAllDisplayed: () => void;
  onClearBatchSelection?: () => void;
  /** 批量删除（已选≥1） */
  onBulkDelete?: () => void;
  bulkDeletePending?: boolean;
  streamBusy?: boolean;
  isGeneratingTitle?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
  onOpenSearch?: () => void;
  movePendingId?: string | null;
  /** 悬停会话行时预取 `/chat/:id`，减轻切换卡顿 */
  onPrefetchConversation?: (id: string) => void;
  /** 首次拉取会话列表中（避免闪「暂无会话」） */
  conversationsLoading?: boolean;
  /** desktop：内联侧栏；drawer：移动端抽屉内全宽展示 */
  variant?: "desktop" | "drawer";
  /** drawer 模式下点击关闭按钮 */
  onMobileClose?: () => void;
};

/** 左侧会话侧栏：文件夹、置顶、批量选择与 ⋮ 菜单。 */
export function Sidebar({
  folders,
  conversationsFull,
  displayedConversations,
  activeId,
  sidebarFilter,
  onSidebarFilterChange,
  onNewChat,
  onSelect,
  onDelete,
  onRenameRequest,
  onExportConversation,
  onTogglePin,
  onMoveToGroup,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  pinnedIds,
  batchMode,
  onToggleBatchMode,
  selectedIds,
  onToggleSelect,
  onSelectAllDisplayed,
  onClearBatchSelection,
  onBulkDelete,
  bulkDeletePending,
  streamBusy = false,
  isGeneratingTitle,
  collapsed = false,
  onToggle,
  onOpenSearch,
  movePendingId,
  onPrefetchConversation,
  conversationsLoading = false,
  variant = "desktop",
  onMobileClose,
}: SidebarProps) {
  const isDrawer = variant === "drawer";
  const toolbarBtnClass = isDrawer
    ? "flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/70 hover:text-foreground active:scale-95 transition-colors"
    : "flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/70 hover:text-foreground active:scale-95 transition-colors";
  const { loading: authLoading, token } = useAuth();
  const listAreaLoading = authLoading || conversationsLoading;

  const showPendingNewChatSkeleton = Boolean(
    token && streamBusy && activeId == null
  );

  const sortedFolders = [...folders].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return 0;
  });

  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    () => new Set(),
  );

  const conversationSections = useMemo(
    () => buildSidebarConversationSections(displayedConversations, pinnedIds),
    [displayedConversations, pinnedIds],
  );

  const toggleSectionExpanded = useCallback((sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  }, []);

  const resolveSectionItems = useCallback(
    (sectionId: string, items: ServerConversation[]) => {
      if (batchMode || expandedSections.has(sectionId)) return items;
      const activeIdx = activeId
        ? items.findIndex((c) => c.id === activeId)
        : -1;
      const limit =
        activeIdx >= SECTION_PREVIEW_LIMIT ? activeIdx + 1 : SECTION_PREVIEW_LIMIT;
      return items.slice(0, limit);
    },
    [activeId, batchMode, expandedSections],
  );

  const renderConversationRow = (c: ServerConversation) => {
    const titleEmpty = !(c.title && c.title.trim());
    const isGenerating =
      activeId === c.id &&
      (Boolean(isGeneratingTitle) || (streamBusy && titleEmpty));

    return (
      <SidebarConversationRow
        key={c.id}
        conversation={c}
        folders={folders}
        activeId={activeId}
        pinnedIds={pinnedIds}
        batchMode={batchMode}
        selectedIds={selectedIds}
        isGenerating={isGenerating}
        movePendingId={movePendingId}
        onSelect={onSelect}
        onToggleSelect={onToggleSelect}
        onToggleBatchMode={onToggleBatchMode}
        onDelete={onDelete}
        onRenameRequest={onRenameRequest}
        onExportConversation={onExportConversation}
        onTogglePin={onTogglePin}
        onMoveToGroup={onMoveToGroup}
        onPrefetchConversation={onPrefetchConversation}
      />
    );
  };

  return (
    <div
      style={isDrawer ? undefined : { width: collapsed ? 0 : 276 }}
      className={clsx(
        "h-full flex-col flex-shrink-0 overflow-hidden bg-sidebar border-r border-border flex",
        !isDrawer && "transition-[width] duration-300 ease-in-out hidden md:flex",
        isDrawer && "w-full border-r-0",
      )}
    >
      <div className={clsx("h-full flex flex-col", isDrawer ? "w-full" : "w-[276px]")}>
        <div className="flex items-center gap-0.5 px-2 pt-2 pb-1">
          {isDrawer ? (
            <button
              type="button"
              onClick={onMobileClose}
              title="关闭侧栏"
              aria-label="关闭侧栏"
              className={toolbarBtnClass}
            >
              <X className="w-[1.05rem] h-[1.05rem]" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onToggle}
              title="收起侧栏"
              aria-label="收起侧栏"
              className={toolbarBtnClass}
            >
              <PanelLeftClose className="w-[1.05rem] h-[1.05rem]" />
            </button>
          )}
          <button
            type="button"
            onClick={onNewChat}
            title="新建会话"
            aria-label="新建会话"
            className={toolbarBtnClass}
          >
            <Plus className="w-[1.05rem] h-[1.05rem]" />
          </button>
          <button
            type="button"
            onClick={onOpenSearch}
            title="搜索对话"
            aria-label="搜索对话"
            className={toolbarBtnClass}
          >
            <Search className="w-[1.05rem] h-[1.05rem]" />
          </button>
        </div>

        <div className="no-scrollbar flex-1 overflow-y-auto px-2 py-2 min-h-0 flex flex-col gap-3">
          {/* 分组 */}
          <div>
            <div className="flex items-center justify-between px-2 mb-1.5">
              <span className="text-xs font-semibold text-muted-foreground">分组</span>
              <button
                type="button"
                title="新建分组"
                onClick={onCreateFolder}
                className="p-1 rounded-md text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="space-y-0.5">
              {sortedFolders.map((g) => (
                <div
                  key={g.id}
                  className={clsx(
                    "group/gf relative flex items-center rounded-lg px-2 py-1.5 text-sm transition-colors",
                    isDrawer ? "min-h-[2.75rem]" : "min-h-[2.25rem]",
                    sidebarFilter === g.id
                      ? "bg-surface shadow-sm border border-border text-foreground font-medium"
                      : "text-muted-foreground hover:bg-muted/80 border border-transparent"
                  )}
                >
                  <button
                    type="button"
                    title={
                      sidebarFilter === g.id && activeId
                        ? "再次点击返回分组管理"
                        : `${g.name}`
                    }
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() => onSidebarFilterChange(g.id)}
                  >
                    <Folder className="w-3.5 h-3.5 shrink-0 opacity-70" />
                    <span className="truncate">{g.name}</span>
                  </button>
                  {(onRenameFolder || onDeleteFolder) && (
                    <DropdownMenu.Root>
                      <DropdownMenu.Trigger asChild>
                        <button
                          type="button"
                          className={clsx(
                            "rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/60",
                            isDrawer ? "opacity-100" : "opacity-0 group-hover/gf:opacity-100",
                          )}
                          aria-label="分组操作"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="w-3.5 h-3.5" />
                        </button>
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Portal>
                        <DropdownMenu.Content
                          className="ui-radix-floating z-[300] min-w-[9rem] rounded-lg border border-border bg-surface py-1 text-sm shadow-lg"
                          align="end"
                          sideOffset={4}
                        >
                          {onRenameFolder && (
                            <DropdownMenu.Item
                              className="flex cursor-pointer items-center gap-2 px-3 py-2 outline-none hover:bg-muted"
                              onSelect={() => onRenameFolder(g.id, g.name)}
                            >
                              <Pencil className="w-3.5 h-3.5" /> 重命名分组
                            </DropdownMenu.Item>
                          )}
                          {onDeleteFolder && (
                            <DropdownMenu.Item
                              className="flex cursor-pointer items-center gap-2 px-3 py-2 text-red-600 outline-none hover:bg-red-50"
                              onSelect={() => onDeleteFolder(g.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" /> 删除分组
                            </DropdownMenu.Item>
                          )}
                        </DropdownMenu.Content>
                      </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 聊天：仅未分组会话列表；分组内会话在分组区与主区工作台打开 */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="mb-2.5 flex items-center justify-between gap-2 px-2">
              <span
                className={clsx(
                  "text-xs font-semibold",
                  batchMode ? "text-orange-800/95" : "text-muted-foreground"
                )}
              >
                {batchMode ? "批量管理" : "聊天"}
              </span>
              <button
                type="button"
                title={batchMode ? "完成批量操作" : "进入批量选择"}
                aria-pressed={batchMode}
                onClick={onToggleBatchMode}
                className={clsx(
                  "shrink-0 rounded-lg p-1.5 transition-colors",
                  batchMode
                    ? "bg-surface px-2 text-[11px] font-medium text-orange-900 shadow-sm ring-1 ring-orange-200/80 hover:bg-orange-50/80"
                    : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                )}
              >
                {batchMode ? (
                  "完成"
                ) : (
                  <CheckSquare className="w-3.5 h-3.5" aria-hidden />
                )}
              </button>
            </div>

            {batchMode && (
              <SidebarBatchBar
                totalCount={displayedConversations.length}
                selectedCount={selectedIds.size}
                onSelectAll={onSelectAllDisplayed}
                onClearSelection={onClearBatchSelection ?? (() => undefined)}
                onBulkDelete={onBulkDelete}
                bulkDeletePending={bulkDeletePending}
              />
            )}

            {listAreaLoading ? (
              <div className="px-2 py-2 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin opacity-70" aria-hidden />
                <span>加载会话…</span>
              </div>
            ) : conversationsFull.length === 0 && !showPendingNewChatSkeleton ? (
              <p className="px-2 text-sm text-muted-foreground leading-relaxed">暂无会话。</p>
            ) : (
              <div className="mt-1 flex min-h-0 flex-1 flex-col gap-2.5">
                {showPendingNewChatSkeleton && (
                  <div className="space-y-0.5">
                    <div className={TIME_SECTION_LABEL_CLASS}>今天</div>
                    <div
                      className="pointer-events-none relative flex min-h-[2.75rem] w-full items-stretch rounded-xl border border-border bg-surface px-3 py-2.5 text-sm shadow-sm"
                      aria-busy
                    >
                      <div className="flex min-w-0 flex-1 items-center">
                        <div className="skeleton-text-shimmer h-4 w-2/3 rounded-md" />
                      </div>
                    </div>
                  </div>
                )}
                {conversationSections.map((section) => {
                  const visibleItems = resolveSectionItems(
                    section.id,
                    section.items,
                  );
                  const hiddenCount = section.items.length - visibleItems.length;
                  const showMore =
                    !batchMode &&
                    hiddenCount > 0 &&
                    !expandedSections.has(section.id);

                  return (
                    <div key={section.id} className="space-y-0.5">
                      <div className={TIME_SECTION_LABEL_CLASS}>{section.label}</div>
                      {visibleItems.map((c) => renderConversationRow(c))}
                      {showMore ? (
                        <button
                          type="button"
                          onClick={() => toggleSectionExpanded(section.id)}
                          className="w-full rounded-lg px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/85 hover:text-foreground"
                        >
                          更多 ({hiddenCount})
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-border space-y-2">
          {authLoading ? (
            <div className="h-10 w-full rounded-lg bg-muted/60 animate-pulse" aria-hidden />
          ) : !token ? (
            <div className="flex gap-2">
              <Link
                href="/login"
                className="flex flex-1 items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:opacity-90 transition-colors"
              >
                <LogIn className="w-4 h-4 shrink-0" />
                登录
              </Link>
              <Link
                href="/register"
                className="flex flex-1 items-center justify-center px-3 py-2.5 text-sm font-medium text-foreground bg-surface border border-border rounded-lg hover:bg-muted transition-colors"
              >
                注册
              </Link>
            </div>
          ) : null}
          <Link
            href="/settings"
            className="w-full flex items-center gap-3 px-2 py-2 text-sm text-foreground hover:bg-muted rounded-md transition-colors text-left"
          >
            <Settings className="w-4 h-4 text-muted-foreground" />
            <span>设置</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

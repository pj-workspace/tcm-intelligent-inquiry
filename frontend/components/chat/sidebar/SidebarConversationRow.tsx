/**
 * @fileoverview 侧栏单条会话行：标题、置顶、批量勾选与上下文菜单。
 */
"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  CheckSquare,
  Download,
  Folder,
  Loader2,
  MoreVertical,
  Pencil,
  Pin,
  Share2,
  Trash2,
} from "lucide-react";
import clsx from "clsx";
import { SidebarBatchRowCheck } from "./SidebarBatchBar";
import type { ConversationFolder, ServerConversation } from "@/types/chat";

export type SidebarConversationRowProps = {
  conversation: ServerConversation;
  folders: ConversationFolder[];
  activeId: string | null;
  pinnedIds: string[];
  batchMode: boolean;
  selectedIds: Set<string>;
  isGenerating: boolean;
  movePendingId?: string | null;
  onSelect: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onToggleBatchMode: () => void;
  onDelete?: (id: string) => void;
  onRenameRequest: (id: string, currentTitle: string) => void;
  onExportConversation: (id: string, title: string) => void;
  onTogglePin: (id: string) => void;
  onMoveToGroup: (conversationId: string, groupId: string | null) => void;
  onPrefetchConversation?: (id: string) => void;
};

/** 侧栏会话列表中的一行（含 hover 预取与 ⋮ 操作）。 */
export function SidebarConversationRow({
  conversation: c,
  folders,
  activeId,
  pinnedIds,
  batchMode,
  selectedIds,
  isGenerating,
  movePendingId,
  onSelect,
  onToggleSelect,
  onToggleBatchMode,
  onDelete,
  onRenameRequest,
  onExportConversation,
  onTogglePin,
  onMoveToGroup,
  onPrefetchConversation,
}: SidebarConversationRowProps) {
  const isActive = activeId === c.id;
  const isPinned = pinnedIds.includes(c.id);

  return (
    <div
      className={clsx(
        "group relative flex min-h-[2.65rem] w-full items-center rounded-xl px-2 py-2 text-sm transition-colors",
        isActive
          ? "border border-border bg-surface font-medium text-foreground shadow-sm"
          : "border border-transparent text-muted-foreground hover:bg-muted/85",
        batchMode && selectedIds.has(c.id) && "bg-orange-50/50 ring-1 ring-orange-300",
      )}
      onMouseEnter={
        !batchMode && onPrefetchConversation && !isGenerating
          ? () => onPrefetchConversation(c.id)
          : undefined
      }
      onClick={
        isGenerating
          ? undefined
          : batchMode
            ? () => onToggleSelect(c.id)
            : () => onSelect(c.id)
      }
      onKeyDown={(e) => {
        if (!batchMode || isGenerating) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggleSelect(c.id);
        }
      }}
      role={batchMode ? "checkbox" : "button"}
      aria-checked={batchMode ? selectedIds.has(c.id) : undefined}
      aria-label={
        batchMode
          ? `${selectedIds.has(c.id) ? "取消选择" : "选择"}会话：${c.title?.trim() || "新会话"}`
          : undefined
      }
      tabIndex={0}
    >
      {batchMode && <SidebarBatchRowCheck selected={selectedIds.has(c.id)} />}
      <div className="flex min-h-0 min-w-0 flex-1 items-center gap-1 pr-1">
        {isPinned && !batchMode && (
          <Pin className="h-3 w-3 shrink-0 text-orange-600/70" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          {isGenerating ? (
            <div className="skeleton-text-shimmer h-4 w-3/4 rounded-md" />
          ) : (
            <span
              className={clsx(
                "block truncate leading-snug",
                isActive && "sidebar-conv-title-sweep font-medium",
              )}
            >
              {c.title || "新会话"}
            </span>
          )}
        </div>
      </div>
      {!batchMode && onDelete && !isGenerating && (
        <div className="flex shrink-0 items-center">
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                }}
                className={clsx(
                  "shrink-0 rounded-md p-1.5 text-muted-foreground transition-opacity hover:bg-muted/60 hover:text-foreground",
                  "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
                  isActive && "opacity-100",
                )}
                aria-label="会话操作"
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="ui-radix-floating z-[300] min-w-[13rem] rounded-lg border border-border bg-surface py-1 text-sm shadow-lg"
                align="end"
                sideOffset={4}
                onCloseAutoFocus={(e) => e.preventDefault()}
              >
                <DropdownMenu.Item
                  className="flex cursor-pointer items-center gap-2 px-3 py-2 outline-none hover:bg-muted"
                  onSelect={(e) => {
                    e.preventDefault();
                    onToggleBatchMode();
                  }}
                >
                  <CheckSquare className="h-3.5 w-3.5" /> 批量操作
                </DropdownMenu.Item>
                <DropdownMenu.Sub>
                  <DropdownMenu.SubTrigger className="flex cursor-default select-none items-center justify-between gap-2 rounded-none px-3 py-2 outline-none hover:bg-muted data-[state=open]:bg-muted">
                    <span className="flex items-center gap-2">
                      <Folder className="h-3.5 w-3.5" /> 移动到分组
                    </span>
                    <span className="text-xs text-muted-foreground">›</span>
                  </DropdownMenu.SubTrigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.SubContent
                      className="ui-radix-floating z-[301] max-h-[min(60vh,16rem)] min-w-[10rem] overflow-y-auto rounded-lg border border-border bg-surface py-1 text-sm shadow-lg"
                      sideOffset={4}
                    >
                      <DropdownMenu.Item
                        className="cursor-pointer px-3 py-2 outline-none hover:bg-muted"
                        disabled={movePendingId === c.id}
                        onSelect={() => void onMoveToGroup(c.id, null)}
                      >
                        移出分组
                      </DropdownMenu.Item>
                      {folders.map((gf) => (
                        <DropdownMenu.Item
                          key={gf.id}
                          className="cursor-pointer px-3 py-2 outline-none hover:bg-muted"
                          disabled={movePendingId === c.id || c.group_id === gf.id}
                          onSelect={() => void onMoveToGroup(c.id, gf.id)}
                        >
                          {gf.name}
                        </DropdownMenu.Item>
                      ))}
                    </DropdownMenu.SubContent>
                  </DropdownMenu.Portal>
                </DropdownMenu.Sub>
                <DropdownMenu.Item
                  className="flex cursor-pointer items-center gap-2 px-3 py-2 outline-none hover:bg-muted"
                  onSelect={() => onRenameRequest(c.id, c.title || "新会话")}
                >
                  <Pencil className="h-3.5 w-3.5" /> 编辑名称
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="pointer-events-none flex cursor-pointer items-center gap-2 px-3 py-2 opacity-45 outline-none"
                  disabled
                >
                  <Share2 className="h-3.5 w-3.5" /> 分享
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="flex cursor-pointer items-center gap-2 px-3 py-2 outline-none hover:bg-muted"
                  onSelect={() => onTogglePin(c.id)}
                >
                  <Pin className="h-3.5 w-3.5" />{" "}
                  {isPinned ? "取消置顶" : "置顶"}
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="flex cursor-pointer items-center gap-2 px-3 py-2 outline-none hover:bg-muted"
                  onSelect={() =>
                    void onExportConversation(c.id, c.title || "新会话")
                  }
                >
                  <Download className="h-3.5 w-3.5" /> 导出会话
                </DropdownMenu.Item>
                <DropdownMenu.Separator className="my-1 h-px bg-muted" />
                <DropdownMenu.Item
                  className="flex cursor-pointer items-center gap-2 px-3 py-2 text-red-600 outline-none hover:bg-red-50"
                  onSelect={() => onDelete(c.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" /> 删除会话
                </DropdownMenu.Item>
                {movePendingId === c.id && (
                  <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> 更新中…
                  </div>
                )}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      )}
    </div>
  );
}

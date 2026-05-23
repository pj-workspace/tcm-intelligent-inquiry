/**
 * @fileoverview 侧栏批量模式工具条与行内多选框。
 */
"use client";

import { Check, Loader2, Trash2 } from "lucide-react";
import clsx from "clsx";

type SidebarBatchBarProps = {
  totalCount: number;
  selectedCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onBulkDelete?: () => void;
  bulkDeletePending?: boolean;
};

/** 批量模式顶栏：全选、清空与删除所选。 */
export function SidebarBatchBar({
  totalCount,
  selectedCount,
  onSelectAll,
  onClearSelection,
  onBulkDelete,
  bulkDeletePending,
}: SidebarBatchBarProps) {
  const canSelectMore = totalCount > 0 && selectedCount < totalCount;
  const hasSelection = selectedCount > 0;

  return (
    <div
      role="toolbar"
      aria-label="批量管理会话"
      className="mx-1.5 mb-2 flex flex-col gap-2 rounded-xl border border-orange-200/80 bg-gradient-to-b from-orange-50/95 to-amber-50/40 px-2.5 py-2.5 shadow-[0_1px_8px_rgba(234,88,12,0.08)]"
    >
      <p className="min-w-0 text-xs leading-tight text-orange-950">
        {totalCount === 0 ? (
          <span className="font-medium text-orange-900/80">当前列表暂无会话</span>
        ) : (
          <>
            <span className="tabular-nums font-semibold">{selectedCount}</span>
            <span className="font-normal text-orange-900/85"> / </span>
            <span className="tabular-nums">{totalCount}</span>
            <span className="ml-1 font-normal text-orange-900/70">条已选</span>
          </>
        )}
      </p>

      {totalCount > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {canSelectMore && (
            <button
              type="button"
              onClick={onSelectAll}
              className="rounded-lg border border-orange-300/70 bg-white/80 px-2.5 py-1 text-[11px] font-medium text-orange-950 shadow-sm hover:bg-white"
            >
              全选
            </button>
          )}
          {hasSelection && (
            <button
              type="button"
              onClick={onClearSelection}
              className="rounded-lg border border-gray-200/90 bg-white/70 px-2.5 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
            >
              取消所选
            </button>
          )}
        </div>
      )}

      {hasSelection && onBulkDelete && (
        <button
          type="button"
          disabled={Boolean(bulkDeletePending)}
          onClick={onBulkDelete}
          className={clsx(
            "flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors",
            bulkDeletePending
              ? "cursor-not-allowed border-red-200/80 bg-red-50/50 text-red-400"
              : "border-red-200 bg-red-50 text-red-800 hover:bg-red-100/90 active:scale-[0.99]"
          )}
        >
          {bulkDeletePending ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
          ) : (
            <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
          )}
          删除所选（{selectedCount}）
        </button>
      )}
    </div>
  );
}

/** 侧栏列表内行级多选框（与批量条风格一致） */
export function SidebarBatchRowCheck({ selected }: { selected: boolean }) {
  return (
    <span
      className={clsx(
        "mr-2 flex h-[1.125rem] w-[1.125rem] shrink-0 self-center items-center justify-center rounded border-2 transition-colors",
        selected
          ? "border-orange-600 bg-orange-600 text-white"
          : "border-gray-300 bg-white"
      )}
      aria-hidden
    >
      {selected && <Check className="h-2.5 w-2.5" strokeWidth={3.5} />}
    </span>
  );
}

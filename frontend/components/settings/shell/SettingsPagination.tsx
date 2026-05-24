/**
 * @fileoverview 设置页列表分页控件。
 */
"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import clsx from "clsx";

type SettingsPaginationProps = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  filteredCount: number;
  pageSize: number;
  className?: string;
};

/** 设置 Tab 底部分页（仅 filteredCount > pageSize 时由调用方渲染）。 */
export function SettingsPagination({
  page,
  totalPages,
  onPageChange,
  filteredCount,
  pageSize,
  className,
}: SettingsPaginationProps) {
  if (filteredCount <= pageSize) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, filteredCount);

  return (
    <div
      className={clsx(
        "flex flex-col gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <p className="text-xs text-gray-500">
        第{" "}
        <span className="tabular-nums font-medium text-gray-700">
          {from}–{to}
        </span>{" "}
        条，共{" "}
        <span className="tabular-nums font-medium text-gray-700">{filteredCount}</span> 条
      </p>
      <div className="flex items-center gap-1 self-end sm:self-auto">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="inline-flex h-9 items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:pointer-events-none disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          上一页
        </button>
        <span className="min-w-[4.5rem] px-2 text-center text-xs tabular-nums text-gray-600">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="inline-flex h-9 items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:pointer-events-none disabled:opacity-40"
        >
          下一页
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

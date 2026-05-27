/**
 * @fileoverview 设置页列表顶栏：搜索框 + 可选筛选区 + 计数。
 */
"use client";

import { Search, X } from "lucide-react";

type SettingsListToolbarProps = {
  query: string;
  onQueryChange: (value: string) => void;
  placeholder?: string;
  totalCount: number;
  filteredCount: number;
  /** 类别筛选等附加控件 */
  children?: React.ReactNode;
};

/** 设置 Tab 列表搜索栏。 */
export function SettingsListToolbar({
  query,
  onQueryChange,
  placeholder = "搜索…",
  totalCount,
  filteredCount,
  children,
}: SettingsListToolbarProps) {
  const showCount = filteredCount !== totalCount || query.trim().length > 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={placeholder}
            className="h-10 w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-9 text-sm outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-500/15"
          />
          {query ? (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-muted-foreground"
              aria-label="清除搜索"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        {showCount ? (
          <p className="shrink-0 text-xs text-muted-foreground sm:text-right">
            显示{" "}
            <span className="font-medium tabular-nums text-foreground">{filteredCount}</span>
            {filteredCount !== totalCount ? (
              <>
                {" "}
                / 共{" "}
                <span className="font-medium tabular-nums text-foreground">{totalCount}</span>
              </>
            ) : null}
          </p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

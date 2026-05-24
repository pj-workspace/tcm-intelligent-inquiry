/**
 * @fileoverview 设置页列表：客户端搜索 + 分页状态。
 */
"use client";

import { useEffect, useMemo, useState } from "react";

type UseSettingsListControlsOptions<T> = {
  pageSize?: number;
  /** 传入已小写、trim 后的 query */
  filter?: (item: T, query: string) => boolean;
};

/** 设置 Tab 内列表的搜索与分页控制。 */
export function useSettingsListControls<T>(
  items: T[],
  { pageSize = 12, filter }: UseSettingsListControlsOptions<T> = {},
) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const normalizedQuery = query.trim().toLowerCase();

  const filteredItems = useMemo(() => {
    if (!filter || !normalizedQuery) return items;
    return items.filter((item) => filter(item, normalizedQuery));
  }, [items, normalizedQuery, filter]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const currentPage = Math.min(page, totalPages);

  useEffect(() => {
    setPage(1);
  }, [normalizedQuery, items.length]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, currentPage, pageSize]);

  return {
    query,
    setQuery,
    page: currentPage,
    setPage,
    totalPages,
    filteredCount: filteredItems.length,
    totalCount: items.length,
    paginatedItems,
    pageSize,
    hasPagination: filteredItems.length > pageSize,
    isFiltering: normalizedQuery.length > 0,
  };
}

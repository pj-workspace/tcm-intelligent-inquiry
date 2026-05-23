/**
 * @fileoverview 知识库向量检索试搜面板：TopK、关键词高亮与分数条。
 */
"use client";

import { useState } from "react";
import { Search, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { Select } from "@/components/ui/Select";
import type { KnowledgeBase, SearchResult } from "@/types/knowledge";

// ─── 关键词高亮 ────────────────────────────────────────────────────────────────
// split 捕获组会将匹配部分放在奇数索引位，非匹配部分在偶数索引位
/** 检索结果 snippet 内关键词高亮（split 捕获组奇偶位着色）。 */
function highlightKeywords(text: string, query: string): React.ReactNode {
  const keywords = query
    .split(/\s+/)
    .filter((k) => k.length > 0)
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

  if (keywords.length === 0) return text;

  const pattern = new RegExp(`(${keywords.join("|")})`, "gi");
  const parts = text.split(pattern);

  return parts.map((part, idx) =>
    idx % 2 === 1 ? (
      <mark
        key={idx}
        className="bg-orange-100 text-orange-800 rounded px-0.5"
      >
        {part}
      </mark>
    ) : (
      part
    )
  );
}

// ─── 分数进度条颜色 ────────────────────────────────────────────────────────────
/** 相似度分数对应的进度条颜色档位。 */
function scoreBarColor(score: number): string {
  if (score > 0.7) return "bg-green-500";
  if (score > 0.4) return "bg-orange-400";
  return "bg-gray-400";
}

interface KnowledgeSearchPanelProps {
  kb: KnowledgeBase;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  searchTopK: number;
  setSearchTopK: (n: number) => void;
  searchResults: SearchResult[];
  searching: boolean;
  hasSearched: boolean;
  onSearch: () => void;
}

const TOP_K_OPTIONS = Array.from({ length: 20 }, (_, i) => ({
  value: String(i + 1),
  label: String(i + 1),
}));

/** 知识库内试搜 UI（非对话内 RAG，供管理员验证索引质量）。 */
export function KnowledgeSearchPanel({
  kb,
  searchQuery,
  setSearchQuery,
  searchTopK,
  setSearchTopK,
  searchResults,
  searching,
  hasSearched,
  onSearch,
}: KnowledgeSearchPanelProps) {
  // 折叠/展开状态，以结果 index 为 key
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());

  const toggleExpand = (idx: number) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setExpandedItems(new Set());
    onSearch();
  };

  const disabled = searching || !searchQuery.trim();

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col h-full"
    >
      <div className="mb-4">
        <h3 className="text-sm font-medium text-gray-900">检索测试</h3>
        <p className="mt-1 text-xs text-gray-500">
          手动验证知识库召回效果，调用与对话工具相同的语义检索逻辑。
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px_auto] sm:items-end">
        <div className="min-w-0">
          <label className="text-xs text-gray-500">查询语句</label>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="例如：四逆汤的组成与适应症"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
          />
        </div>
        <div className="min-w-0">
          <label className="text-xs text-gray-500">返回片段数 top_k</label>
          <Select
            className="mt-1"
            value={String(searchTopK)}
            onValueChange={(v) => setSearchTopK(Number(v) || 5)}
            options={TOP_K_OPTIONS}
          />
        </div>
        <button
          type="submit"
          disabled={disabled}
          className="flex h-10 items-center gap-2 rounded-lg bg-black px-4 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-40"
        >
          {searching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          {searching ? "检索中…" : "检索"}
        </button>
      </div>

      {kb?.embedding_model ? (
        <p className="mt-3 text-xs text-gray-500">
          当前知识库 embedding 模型：
          <span className="ml-1 font-mono text-gray-700">
            {kb.embedding_provider
              ? `${kb.embedding_provider} / `
              : ""}
            {kb.embedding_model}
          </span>
          {kb.embedding_dim ? `（${kb.embedding_dim} 维）` : ""}
        </p>
      ) : null}

      {hasSearched && !searching && searchResults.length === 0 && (
        <div className="mt-4 rounded-lg border border-dashed border-gray-200 px-3 py-6 text-center text-xs text-gray-500">
          未召回任何片段，可尝试换个表述或调高 top_k。
        </div>
      )}

      {searchResults.length > 0 && (
        <div className="mt-4 border-t border-gray-100 pt-4">
          <div className="mb-2 text-xs text-gray-500">
            检索结果（{searchResults.length}）
          </div>
          <ol className="space-y-3">
            {searchResults.map((r, i) => {
              const isExpanded = expandedItems.has(i);
              const normalizedScore = Math.min(r.score, 1);
              const barWidth = Math.round(normalizedScore * 100);

              return (
                <li
                  key={`${r.source}-${i}`}
                  className="rounded-lg border border-gray-200 bg-gray-50/40 p-3"
                >
                  {/* 标题行：来源 + 分数 badge + 进度条 */}
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="min-w-0 flex-1 truncate font-mono">
                      #{i + 1} · {r.source}
                    </span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {/* 进度条 */}
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-200">
                        <div
                          className={`h-full rounded-full transition-all ${scoreBarColor(normalizedScore)}`}
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                      {/* 分数 badge */}
                      <span className="rounded-full bg-orange-100 px-2 py-0.5 font-mono text-[10px] text-orange-700">
                        score {r.score.toFixed(4)}
                      </span>
                    </div>
                  </div>

                  {/* 内容区域：折叠 / 展开 */}
                  <div className="relative mt-2">
                    <pre
                      onClick={() => !isExpanded && toggleExpand(i)}
                      className={`max-w-full whitespace-pre-wrap break-words font-sans text-sm text-gray-700 ${
                        isExpanded
                          ? "max-h-[min(24rem,50vh)] overflow-auto"
                          : "line-clamp-3 cursor-pointer"
                      }`}
                    >
                      {highlightKeywords(r.content, searchQuery)}
                    </pre>
                    {/* 折叠渐变遮罩 */}
                    {!isExpanded && (
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-b from-transparent to-white/80" />
                    )}
                  </div>

                  {/* 展开/收起按钮 */}
                  <button
                    type="button"
                    onClick={() => toggleExpand(i)}
                    className="mt-1.5 flex items-center gap-0.5 text-xs text-gray-400 hover:text-gray-600"
                  >
                    {isExpanded ? (
                      <>
                        <ChevronUp className="h-3.5 w-3.5" />
                        收起
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-3.5 w-3.5" />
                        展开
                      </>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </form>
  );
}

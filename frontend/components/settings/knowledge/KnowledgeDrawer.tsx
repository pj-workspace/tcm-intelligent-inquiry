/**
 * @fileoverview 知识库详情抽屉：文档列表、上传与向量检索试搜。
 */
"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, FileText, Loader2, Upload, Search } from "lucide-react";
import { uiModalBackdrop, uiModalPanel } from "@/lib/ui-motion";
import type { KnowledgeBase, KnowledgeDocument, IngestJobState, SearchResult } from "@/types/knowledge";
import { KnowledgeUploadPanel } from "./KnowledgeUploadPanel";
import { KnowledgeSearchPanel } from "./KnowledgeSearchPanel";
import { formatFileSize } from "@/lib/format";

interface KnowledgeDrawerProps {
  open: boolean;
  onClose: () => void;
  kb: KnowledgeBase | null;
  // Document props
  documents: KnowledgeDocument[] | undefined;
  loadingDocs: boolean;
  deletingDocId: string | null;
  onRequestDeleteDoc: (doc: KnowledgeDocument) => void;
  // Upload props
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  ingestJobs: IngestJobState[];
  onFilesSelected: (files: File[]) => void;
  onRetry: (job: IngestJobState) => void;
  // Search props
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  searchTopK: number;
  setSearchTopK: (n: number) => void;
  searchResults: SearchResult[];
  searching: boolean;
  hasSearched: boolean;
  onSearch: () => void;
}

/** ISO 时间转本地 locale 字符串。 */
function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("zh-CN");
  } catch {
    return iso;
  }
}

/** 知识库侧滑抽屉（文档 + 上传 + 搜索 Tab）。 */
export function KnowledgeDrawer({
  open,
  onClose,
  kb,
  documents,
  loadingDocs,
  deletingDocId,
  onRequestDeleteDoc,
  fileInputRef,
  ingestJobs,
  onFilesSelected,
  onRetry,
  searchQuery,
  setSearchQuery,
  searchTopK,
  setSearchTopK,
  searchResults,
  searching,
  hasSearched,
  onSearch,
}: KnowledgeDrawerProps) {
  const [activeTab, setActiveTab] = useState<"docs" | "upload" | "search">("docs");

  return (
    <AnimatePresence>
      {open && kb ? (
        <motion.div
          key={kb.id}
          className="fixed inset-0 z-50 flex bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4 md:p-6"
          onClick={(e) => e.target === e.currentTarget && onClose()}
          {...uiModalBackdrop}
        >
          <motion.div
            className="relative flex h-dvh w-full max-w-none flex-col rounded-none bg-white shadow-2xl sm:h-auto sm:max-h-[min(calc(100dvh-2rem),900px)] sm:max-w-3xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
            {...uiModalPanel}
          >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-4 sm:px-6">
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-base font-semibold text-gray-900">{kb.name}</h2>
              <p className="mt-0.5 truncate text-xs text-gray-500">
                {kb.document_count} 篇文档
                {kb.total_chunks ? ` · ${kb.total_chunks} 片段` : ""}
                {kb.embedding_model ? ` · ${kb.embedding_model}` : ""}
              </p>
            </div>
            <button
              onClick={onClose}
              className="ml-4 shrink-0 rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Tabs */}
          <div className="shrink-0 border-b border-gray-100 px-4 sm:px-6">
            <nav className="no-scrollbar -mb-px flex gap-4 overflow-x-auto sm:gap-6">
              {(
                [
                  { key: "docs", icon: FileText, label: "文档列表" },
                  { key: "upload", icon: Upload, label: "上传文档" },
                  { key: "search", icon: Search, label: "检索测试" },
                ] as const
              ).map(({ key, icon: Icon, label }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                    activeTab === key
                      ? "border-orange-500 text-orange-600"
                      : "border-transparent text-gray-500 hover:border-gray-200 hover:text-gray-700"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                  {key === "upload" &&
                    ingestJobs.some(
                      (j) => j.status === "uploading" || j.status === "running"
                    ) && (
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-500" />
                      </span>
                    )}
                </button>
              ))}
            </nav>
          </div>

          {/* Content */}
          <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:p-6">
            {activeTab === "docs" && (
              <>
                {loadingDocs ? (
                  <div className="flex items-center justify-center py-16 text-sm text-gray-500">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 加载文档列表中…
                  </div>
                ) : !documents || documents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center text-gray-500">
                    <FileText className="mb-3 h-8 w-8 text-gray-300" />
                    <p className="text-sm">暂无已入库文档</p>
                    <button
                      onClick={() => setActiveTab("upload")}
                      className="mt-4 text-xs text-orange-600 hover:underline"
                    >
                      去上传文档 →
                    </button>
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden">
                    {documents.map((doc) => {
                      const isDeleting = deletingDocId === doc.id;
                      return (
                        <li
                          key={doc.id}
                          className="flex items-center gap-4 px-5 py-3.5 text-sm hover:bg-gray-50 transition-colors"
                        >
                          <FileText className="h-4 w-4 shrink-0 text-gray-400" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium text-gray-800" title={doc.filename}>
                              {doc.filename}
                            </div>
                            <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-gray-500">
                              <span>{doc.chunk_count} 片段</span>
                              <span>{formatFileSize(doc.file_size)}</span>
                              <span>{formatTime(doc.created_at)}</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            title="删除该文档"
                            disabled={isDeleting}
                            onClick={() => onRequestDeleteDoc(doc)}
                            className="shrink-0 rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                          >
                            {isDeleting ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <X className="h-4 w-4" />
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}

            {activeTab === "upload" && (
              <KnowledgeUploadPanel
                kbId={kb.id}
                fileInputRef={fileInputRef}
                ingestJobs={ingestJobs}
                onFilesSelected={onFilesSelected}
                onRetry={onRetry}
              />
            )}

            {activeTab === "search" && (
              <KnowledgeSearchPanel
                kb={kb}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                searchTopK={searchTopK}
                setSearchTopK={setSearchTopK}
                searchResults={searchResults}
                searching={searching}
                hasSearched={hasSearched}
                onSearch={onSearch}
              />
            )}
          </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
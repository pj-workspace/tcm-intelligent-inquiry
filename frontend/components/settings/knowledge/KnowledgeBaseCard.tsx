/**
 * @fileoverview 知识库列表卡片：打开抽屉、编辑与删除。
 */
"use client";

import type { KeyboardEvent } from "react";
import { Pencil, Trash2, Database } from "lucide-react";
import type { KnowledgeBase } from "@/types/knowledge";

interface KnowledgeBaseCardProps {
  kb: KnowledgeBase;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

/** 知识库摘要卡片（点击进入抽屉）。 */
export function KnowledgeBaseCard({
  kb,
  onOpen,
  onEdit,
  onDelete,
}: KnowledgeBaseCardProps) {
/** 知识库卡片键盘 Enter/Space 打开抽屉。 */
  const handleOpenKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen();
    }
  };

  return (
    <div className="group relative box-border flex w-full min-w-0 max-w-full flex-col rounded-xl border border-border bg-surface p-5 shadow-sm transition-all hover:border-orange-300 hover:shadow-md">
      {/*
        flow-root + 浮动 + overflow-hidden(BFC)：不依赖 flex/grid 的 1fr 分配，
        首轮布局即能得到「图标 | 正文占满剩余 | 按钮」的稳定宽度，避免 resize 才正常。
      */}
      <div className="flow-root w-full min-w-0">
        <div className="float-left mr-3 mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
          <Database className="h-5 w-5" />
        </div>
        <div className="float-right z-10 -mt-0.5 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 max-sm:opacity-100">
          <button
            type="button"
            title="编辑"
            onClick={onEdit}
            className="rounded-md p-2 text-muted-foreground hover:bg-orange-50 hover:text-orange-600"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="删除知识库"
            onClick={onDelete}
            className="rounded-md p-2 text-muted-foreground hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
        <div
          role="button"
          tabIndex={0}
          onClick={onOpen}
          onKeyDown={handleOpenKeyDown}
          aria-label={`打开知识库：${kb.name}`}
          className="min-w-0 cursor-pointer overflow-hidden rounded-lg py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2"
        >
          <h4 className="break-words font-medium leading-snug text-foreground transition-colors group-hover:text-orange-600">
            {kb.name}
          </h4>
          <p className="mt-1 text-xs leading-snug text-muted-foreground">
            {kb.document_count} 篇文档
            {kb.total_chunks ? ` · ${kb.total_chunks} 片段` : ""}
          </p>
        </div>
      </div>

      {kb.description ? (
        <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
          {kb.description}
        </p>
      ) : null}

      {kb.embedding_model ? (
        <div className="mt-4 mt-auto flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
          <span className="min-w-0 truncate font-mono">{kb.embedding_model}</span>
          <span className="shrink-0 font-mono text-[10px]">
            {kb.id.slice(0, 8)}
          </span>
        </div>
      ) : null}
    </div>
  );
}

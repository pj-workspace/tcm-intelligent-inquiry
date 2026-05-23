/**
 * @fileoverview 知识库文档上传面板：拖拽、类型过滤与 ingest 任务状态。
 */
"use client";

import { useState, useRef } from "react";
import { Upload, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Select } from "@/components/ui/Select";
import { TERMINAL } from "@/types/knowledge";
import type { KnowledgeBase, IngestJobState } from "@/types/knowledge";

const ACCEPTED_EXTS = [".pdf", ".txt", ".md", ".docx"] as const;

/** 按允许扩展名拆分有效/无效文件。 */
function filterFiles(files: File[]): { valid: File[]; invalid: File[] } {
  const valid: File[] = [];
  const invalid: File[] = [];
  for (const f of files) {
    const lower = f.name.toLowerCase();
    if (ACCEPTED_EXTS.some((ext) => lower.endsWith(ext))) {
      valid.push(f);
    } else {
      invalid.push(f);
    }
  }
  return { valid, invalid };
}

interface KnowledgeUploadPanelProps {
  kbId: string;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  ingestJobs: IngestJobState[];
  onFilesSelected: (files: File[]) => void;
  onRetry: (job: IngestJobState) => void;
}

/** 知识库文档上传与 ingest 进度列表。 */
export function KnowledgeUploadPanel({
  kbId,
  fileInputRef,
  ingestJobs,
  onFilesSelected,
  onRetry,
}: KnowledgeUploadPanelProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  const handleFiles = (files: FileList | File[]) => {
    const arr = Array.from(files);
    const { valid, invalid } = filterFiles(arr);
    if (invalid.length > 0) {
      toast.error(
        `以下文件格式不支持，已跳过：${invalid.map((f) => f.name).join("、")}（仅支持 PDF、TXT、Markdown、Word）`
      );
    }
    if (valid.length > 0) {
      onFilesSelected(valid);
    }
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);
    if (!kbId) {
      toast.warning("知识库无效");
      return;
    }
    handleFiles(e.dataTransfer.files);
  };

  const handleClick = () => {
    if (!kbId) {
      toast.warning("知识库无效");
      return;
    }
    fileInputRef.current?.click();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
    e.target.value = "";
  };

  return (
    <div className="flex flex-col h-full">
      <div className="mb-4">
        <h3 className="text-sm font-medium text-gray-900">上传文档</h3>
        <p className="mt-1 text-xs text-gray-500">
          大文件将异步入库，下方可查看处理进度。
        </p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.txt,.md,.docx,application/pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={handleInputChange}
      />

      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => e.key === "Enter" && handleClick()}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={[
          "mt-3 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-sm transition-colors select-none outline-none",
          isDragging
            ? "border-orange-400 bg-orange-50 text-orange-600"
            : "border-gray-300 bg-gray-50 text-gray-500 hover:border-orange-300 hover:bg-orange-50/40",
        ].join(" ")}
      >
        <Upload
          className={[
            "h-8 w-8 transition-colors",
            isDragging ? "text-orange-400" : "text-gray-400",
          ].join(" ")}
        />
        <span className="font-medium">
          {isDragging ? "松开鼠标以上传文件" : "拖拽文件到此处，或点击选择"}
        </span>
        <span className="text-xs text-gray-400">
          支持 PDF、TXT、Markdown（.md）、Word（.docx），可多选
        </span>
      </div>

      {ingestJobs.length > 0 && (
        <ul className="mt-4 space-y-3 border-t border-gray-100 pt-4 text-sm">
          {ingestJobs.map((j) => {
            const isTerminal = TERMINAL.has(j.status);

            // 两段进度：上传阶段占前半段（0-50），服务端处理占后半段（50-100）
            let barPct: number;
            if (j.status === "uploading") {
              barPct = Math.round((j.uploadProgress ?? 0) * 0.5); // 0-50%
            } else if (j.status === "pending") {
              barPct = 52; // 上传完成，等服务端开始
            } else if (j.status === "running") {
              // 有真实服务端进度则使用，否则 fallback 到固定值
              const sp = j.serverProgress ?? 40;
              barPct = 50 + Math.round(sp * 0.5); // 50-100%
            } else {
              barPct = 100; // completed / failed
            }

            const barColor =
              j.status === "completed"
                ? "bg-green-500"
                : j.status === "failed"
                  ? "bg-red-400"
                  : "bg-orange-400";
            const statusLabel: Record<string, string> = {
              uploading: "上传中",
              pending: "等待处理",
              running: "入库中",
              completed: "已完成",
              failed: "失败",
            };
            const phaseLabel: Record<string, string> = {
              extracting: "解析文本",
              chunking: "文本分块",
              embedding: "向量化",
              writing: "写入向量库",
              done: "完成",
            };

            return (
              <li
                key={j.jobId}
                className="overflow-hidden rounded-lg border border-gray-200 bg-white"
              >
                {/* 进度条 */}
                <div className="h-1.5 w-full bg-gray-100">
                  <div
                    className={[
                      "h-full transition-all duration-500 ease-out",
                      barColor,
                      !isTerminal && j.status !== "uploading" ? "animate-pulse" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={{ width: `${barPct}%` }}
                  />
                </div>

                {/* 文件信息行 */}
                <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span className="min-w-0 truncate text-gray-700">
                    {j.filename}
                    <span className="ml-2 font-mono text-xs text-gray-400">
                      {j.jobId.slice(0, 8)}…
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {!isTerminal && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-orange-400" />
                    )}
                    <span
                      className={
                        j.status === "failed"
                          ? "text-red-600"
                          : j.status === "completed"
                            ? "text-green-600"
                            : "text-orange-500"
                      }
                    >
                      {statusLabel[j.status] ?? j.status}
                      {j.status === "uploading" && j.uploadProgress !== undefined
                        ? ` ${j.uploadProgress}%`
                        : j.status === "running" && j.phase && j.phase !== "done"
                          ? ` · ${phaseLabel[j.phase] ?? j.phase}${j.serverProgress !== undefined ? ` ${j.serverProgress}%` : ""}`
                          : ""}
                    </span>
                    {j.status === "failed" && (
                      <button
                        type="button"
                        onClick={() => onRetry(j)}
                        className="flex items-center gap-1 rounded-md border border-orange-300 bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-600 hover:bg-orange-100 active:bg-orange-200"
                      >
                        <RotateCcw className="h-3 w-3" />
                        重试
                      </button>
                    )}
                  </span>
                  {j.error && (
                    <p className="w-full text-xs text-red-600">{j.error}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

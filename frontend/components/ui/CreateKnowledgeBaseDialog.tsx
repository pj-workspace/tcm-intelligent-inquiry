/**
 * @fileoverview 新建知识库对话框。
 */
"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { uiModalBackdrop, uiModalPanel } from "@/lib/ui-motion";

export type CreateKnowledgeBaseDialogProps = {
  open: boolean;
  pending?: boolean;
  onSubmit: (data: { name: string; description: string }) => void;
  onCancel: () => void;
};

/** 新建知识库对话框。 */
export function CreateKnowledgeBaseDialog({
  open,
  pending = false,
  onSubmit,
  onCancel,
}: CreateKnowledgeBaseDialogProps) {
  return (
    <AnimatePresence>
      {open && (
        <CreateKnowledgeBaseDialogForm
          pending={pending}
          onSubmit={onSubmit}
          onCancel={onCancel}
        />
      )}
    </AnimatePresence>
  );
}

interface FormProps {
  pending: boolean;
  onSubmit: (data: { name: string; description: string }) => void;
  onCancel: () => void;
}

/** 新建知识库内层表单（随 open 挂载/卸载以重置 state）。 */
function CreateKnowledgeBaseDialogForm({ pending, onSubmit, onCancel }: FormProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, onCancel]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || pending) return;
    onSubmit({ name: name.trim(), description: description.trim() });
  };

  return (
    <motion.div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-kb-dialog-title"
      onClick={pending ? undefined : onCancel}
      {...uiModalBackdrop}
    >
      <motion.form
        onSubmit={handleSubmit}
        className="relative w-full max-w-md rounded-2xl border border-[#e5e5e5] bg-white p-6 shadow-[0_8px_40px_rgba(0,0,0,0.12)]"
        onClick={(e) => e.stopPropagation()}
        {...uiModalPanel}
      >
        <button
          type="button"
          onClick={pending ? undefined : onCancel}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:pointer-events-none"
          aria-label="关闭"
        >
          <X className="h-5 w-5" />
        </button>
        <h2 id="create-kb-dialog-title" className="pr-10 text-lg font-semibold text-gray-900">
          新建知识库
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          创建后可上传 PDF、TXT、Markdown 或 Word 文档供对话检索。
        </p>
        <div className="mt-4 space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">
              名称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400 disabled:bg-gray-50"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={pending}
              placeholder="例如：课程资料"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">说明</label>
            <textarea
              rows={3}
              className="w-full resize-y rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400 disabled:bg-gray-50"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={pending}
              placeholder="可选"
            />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={onCancel}
            className="rounded-xl border border-[#e5e5e5] bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={pending || !name.trim()}
            className="rounded-xl bg-[#1a1a1a] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
          >
            {pending ? "创建中…" : "创建"}
          </button>
        </div>
      </motion.form>
    </motion.div>
  );
}

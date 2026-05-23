/**
 * @fileoverview 知识库编辑对话框：AnimatePresence 卸载时重置表单，避免 effect 同步 props。
 */
"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { uiModalBackdrop, uiModalPanel } from "@/lib/ui-motion";
import type { KnowledgeBase } from "@/types/knowledge";

export type EditKnowledgeBaseDialogProps = {
  open: boolean;
  kb: KnowledgeBase | null;
  pending?: boolean;
  onSubmit: (data: { name: string; description: string }) => void;
  onCancel: () => void;
};

/**
 * 编辑知识库对话框。
 * 表单状态由内部子组件持有：当 open 切为 false 时 AnimatePresence 卸载子组件，
 * 下次再次打开会以传入的 `kb` 作为 useState 的 lazy 初值，避免在 useEffect 中
 * 同步 props（满足 react-hooks/set-state-in-effect 规则）。
 */
export function EditKnowledgeBaseDialog({
  open,
  kb,
  pending = false,
  onSubmit,
  onCancel,
}: EditKnowledgeBaseDialogProps) {
  return (
    <AnimatePresence>
      {open && kb && (
        <EditKnowledgeBaseDialogForm
          kb={kb}
          pending={pending}
          onSubmit={onSubmit}
          onCancel={onCancel}
        />
      )}
    </AnimatePresence>
  );
}

interface FormProps {
  kb: KnowledgeBase;
  pending: boolean;
  onSubmit: (data: { name: string; description: string }) => void;
  onCancel: () => void;
}

/** 编辑知识库名称与说明的内层表单（随 open 挂载/卸载以重置 state）。 */
function EditKnowledgeBaseDialogForm({
  kb,
  pending,
  onSubmit,
  onCancel,
}: FormProps) {
  const [name, setName] = useState(kb.name);
  const [description, setDescription] = useState(kb.description);

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
      key={kb.id}
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-kb-dialog-title"
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
        <h2
          id="edit-kb-dialog-title"
          className="pr-10 text-lg font-semibold text-gray-900"
        >
          编辑知识库
        </h2>
        <p className="mt-1 text-xs text-gray-500">
          ID: <span className="font-mono text-gray-600">{kb.id}</span>
        </p>
        <div className="mt-4 space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">
              名称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400 disabled:bg-gray-50"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={pending}
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
            className="px-4 py-2 text-sm font-medium text-gray-700 rounded-xl border border-[#e5e5e5] bg-white hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={pending || !name.trim()}
            className="px-4 py-2 text-sm font-medium rounded-xl text-white bg-[#1a1a1a] hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            {pending ? "请稍候…" : "保存"}
          </button>
        </div>
      </motion.form>
    </motion.div>
  );
}

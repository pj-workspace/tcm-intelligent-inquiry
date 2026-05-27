/**
 * @fileoverview 通用确认对话框：支持危险操作样式与 pending 禁用。
 */
"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { uiModalBackdrop, uiModalPanel } from "@/lib/ui-motion";

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** 提交中，禁用按钮并显示「请稍候」类状态 */
  pending?: boolean;
  /** 确认按钮使用警示色 */
  danger?: boolean;
};

/** 模态确认框；Esc 关闭（pending 时忽略）。 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "确定",
  cancelLabel = "取消",
  onConfirm,
  onCancel,
  pending = false,
  danger = false,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open || pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending, onCancel]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-foreground/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          onClick={pending ? undefined : onCancel}
          {...uiModalBackdrop}
        >
          <motion.div
            className="relative w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-[0_8px_40px_rgba(0,0,0,0.12)]"
            onClick={(e) => e.stopPropagation()}
            {...uiModalPanel}
          >
            <button
              type="button"
              onClick={pending ? undefined : onCancel}
              className="absolute right-3 top-3 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none"
              aria-label="关闭"
            >
              <X className="h-5 w-5" />
            </button>
            <h2
              id="confirm-dialog-title"
              className="pr-10 text-lg font-semibold text-foreground"
            >
              {title}
            </h2>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{description}</p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={onCancel}
                className="px-4 py-2 text-sm font-medium text-foreground rounded-xl border border-border bg-surface hover:bg-muted transition-colors disabled:opacity-50"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={onConfirm}
                className={`px-4 py-2 text-sm font-medium rounded-xl transition-colors disabled:opacity-50 ${
                  danger
                    ? "bg-red-600 text-white hover:bg-red-700"
                    : "bg-primary text-primary-foreground hover:opacity-90"
                }`}
              >
                {pending ? "请稍候…" : confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

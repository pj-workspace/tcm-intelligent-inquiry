/**
 * @fileoverview 用户消息图片全屏 Lightbox（Portal、键盘左右/Esc）。
 */
"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

type ImagePreviewLightboxProps = {
  urls: string[];
  index: number | null;
  onClose: () => void;
  onIndexChange: (i: number) => void;
};

/** 全屏图片预览；`index` 为 null 时关闭。 */
export function ImagePreviewLightbox({
  urls,
  index,
  onClose,
  onIndexChange,
}: ImagePreviewLightboxProps) {
  const indexRef = useRef(index);

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  const open = index !== null && urls.length > 0;
  const safeIndex =
    index === null ? 0 : Math.min(Math.max(0, index), urls.length - 1);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const cur = indexRef.current;
      if (cur === null) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      const n = urls.length;
      if (n <= 1) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        onIndexChange((cur - 1 + n) % n);
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        onIndexChange((cur + 1) % n);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, urls.length, onClose, onIndexChange]);

  if (typeof document === "undefined") return null;

  const url = open ? urls[safeIndex] : "";

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          key="image-lightbox-root"
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 pb-16 pt-14 sm:pb-20 sm:pt-16"
          role="dialog"
          aria-modal="true"
          aria-label="图片预览"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
        >
          <div className="pointer-events-none absolute inset-0 bg-black/88 backdrop-blur-[2px]" />

          <div
            className="relative z-10 flex max-h-full max-w-[min(100%,96vw)] flex-col items-center outline-none"
            onClick={(e) => e.stopPropagation()}
          >
            <motion.div
              key={safeIndex}
              initial={{ opacity: 0.9, scale: 0.99 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.15 }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- 动态 URL 大图预览 */}
              <img
                src={url}
                alt=""
                className="max-h-[min(82dvh,calc(100vh-10rem))] max-w-[min(100%,96vw)] rounded-lg object-contain shadow-[0_8px_40px_rgba(0,0,0,0.45)]"
                draggable={false}
              />
            </motion.div>
            <p className="mt-2 max-w-xl text-center text-[11px] text-white/60">
              点击外侧暗区关闭 · 键盘 ← → 切换
            </p>
          </div>

          <button
            type="button"
            aria-label="关闭"
            title="关闭"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="absolute right-4 top-4 z-20 rounded-full bg-white/10 p-2.5 text-white transition-colors hover:bg-white/20"
          >
            <X className="h-5 w-5" strokeWidth={2} />
          </button>

          {urls.length > 1 ? (
            <>
              <button
                type="button"
                aria-label="上一张"
                title="上一张"
                className="absolute left-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-white/12 p-2.5 text-white transition-colors hover:bg-white/22 sm:left-4"
                onClick={(e) => {
                  e.stopPropagation();
                  onIndexChange((safeIndex - 1 + urls.length) % urls.length);
                }}
              >
                <ChevronLeft className="h-8 w-8" strokeWidth={1.8} />
              </button>
              <button
                type="button"
                aria-label="下一张"
                title="下一张"
                className="absolute right-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-white/12 p-2.5 text-white transition-colors hover:bg-white/22 sm:right-4"
                onClick={(e) => {
                  e.stopPropagation();
                  onIndexChange((safeIndex + 1) % urls.length);
                }}
              >
                <ChevronRight className="h-8 w-8" strokeWidth={1.8} />
              </button>
              <span className="pointer-events-none absolute bottom-6 left-0 right-0 z-10 text-center text-[12px] font-medium tabular-nums text-white/75">
                {safeIndex + 1} / {urls.length}
              </span>
            </>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}

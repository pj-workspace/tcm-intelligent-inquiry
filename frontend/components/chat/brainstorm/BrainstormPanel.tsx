"use client";

import { useCallback, useState } from "react";
import clsx from "clsx";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

import type { BrainstormPanelProps } from "@/types/brainstorm";
import {
  streamingTraceHeadline,
  summarizeTraceHeadline,
} from "@/lib/brainstorm-utils";
import { useBrainstormScroll } from "@/hooks/useBrainstormScroll";
import { BrainstormStepItem } from "./BrainstormStepItem";

export type { BrainstormStep } from "@/types/brainstorm";

export function BrainstormPanel({
  steps,
  isStreaming,
  durationSec,
  collapsed = false,
  onToggle,
  compactTopAfterAssistant = false,
}: BrainstormPanelProps) {
  const isOpen = !collapsed;
  const [toolIoExpanded, setToolIoExpanded] = useState<Record<string, boolean>>({});
  const { scrollRef, edgeFade, onScroll, onWheel } = useBrainstormScroll({ steps, isOpen });

  const toggleToolIo = useCallback((stepId: string) => {
    setToolIoExpanded((prev) => ({ ...prev, [stepId]: !prev[stepId] }));
  }, []);

  const traceHeadline = isStreaming
    ? streamingTraceHeadline(steps)
    : summarizeTraceHeadline(steps, durationSec);

  return (
    <div
      className={clsx(
        "flex w-full max-w-3xl lg:max-w-4xl xl:max-w-5xl justify-start px-4 sm:px-5 md:mx-auto md:px-6 lg:px-8",
        compactTopAfterAssistant ? "pt-0 pb-4" : "pt-1.5 pb-4",
      )}
    >
      <div className="w-full max-w-full">
        <button
          type="button"
          onClick={onToggle}
          className="relative isolate flex w-fit max-w-full cursor-pointer items-center gap-1.5 overflow-hidden text-left transition-opacity hover:opacity-70 focus-visible:outline-none"
          aria-expanded={isOpen}
        >
          <motion.span
            animate={{ rotate: isOpen ? 0 : -90 }}
            transition={{ duration: 0.18, ease: "easeInOut" }}
            className="relative z-0 shrink-0 text-gray-400"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </motion.span>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={traceHeadline}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="relative z-0 truncate text-[13px] font-medium text-gray-500"
            >
              {traceHeadline}
            </motion.span>
          </AnimatePresence>
          {isStreaming && (
            <span
              aria-hidden
              className="brainstorm-sweep pointer-events-none absolute inset-0 z-[1] rounded-2xl mix-blend-soft-light"
            />
          )}
        </button>

        {/* ── 展开内容 ────────────────────────────────── */}
        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div className="scroll-fade-shell relative">
                <div
                  ref={scrollRef}
                  onScroll={onScroll}
                  onWheel={onWheel}
                  className="brainstorm-scroll-area no-scrollbar max-h-[min(28rem,58vh)] overflow-y-auto px-4 pb-1 pr-3 [scrollbar-width:none] [-ms-overflow-style:none]"
                >
                  <div className="relative flex flex-col">
                    {/* 时间轴竖线：穿过图标节点中心（pl-7 中 1.1rem 图标的中点 ≈ 0.55rem） */}
                    <span
                      aria-hidden
                      className="pointer-events-none absolute left-[0.53rem] top-3 bottom-3 w-px rounded-full bg-gradient-to-b from-[#e6ddd0] via-[#d8cdb9] to-[#e6ddd0] opacity-70"
                    />
                    {steps.map((step, idx) => (
                      <BrainstormStepItem
                        key={step.id}
                        step={step}
                        isFirst={idx === 0}
                        isLast={idx === steps.length - 1}
                        isStreaming={isStreaming}
                        expanded={!!toolIoExpanded[step.id]}
                        onToggle={() => toggleToolIo(step.id)}
                      />
                    ))}
                  </div>
                </div>
                <span
                  aria-hidden
                  className={clsx("scroll-fade-top", edgeFade.top && "is-visible")}
                />
                <span
                  aria-hidden
                  className={clsx("scroll-fade-bottom", edgeFade.bottom && "is-visible")}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

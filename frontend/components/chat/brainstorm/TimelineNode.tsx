/**
 * @fileoverview Brainstorm 时间轴节点图标（thinking / tool / user_input / trace 收口态）。
 */
"use client";

import clsx from "clsx";
import { Check, Clock, Loader2, UserRound, Wrench, XCircle } from "lucide-react";

export type TimelineNodeKind =
  | "thinking"
  | "thinking_active"
  | "tool"
  | "tool_running"
  | "tool_error"
  | "user_input"
  | "user_input_done"
  /** trace 正常收口的尾节点；视觉为 ✓ */
  | "trace_done"
  /** trace 由 abort / 错误收口的尾节点；视觉为 ⊗ */
  | "trace_aborted";

interface TimelineNodeProps {
  kind: TimelineNodeKind;
}

/** 时间轴节点：固定绝对定位在父容器 pl-7 的左侧，覆盖在 BrainstormPanel 的竖线上。 */
export function TimelineNode({ kind }: TimelineNodeProps) {
  const isTool =
    kind === "tool" || kind === "tool_running" || kind === "tool_error";
  const Icon =
    kind === "tool_running"
      ? Loader2
      : kind === "tool_error"
      ? XCircle
      : isTool
      ? Wrench
      : kind === "user_input" || kind === "user_input_done"
      ? UserRound
      : kind === "trace_done"
      ? Check
      : kind === "trace_aborted"
      ? XCircle
      : Clock;

  const iconClass = clsx(
    "h-3 w-3 shrink-0",
    kind === "thinking_active" && "animate-pulse text-muted-foreground",
    kind === "thinking" && "text-muted-foreground",
    kind === "tool" && "text-[#5b78ad]",
    kind === "tool_running" && "animate-spin text-[#5b78ad]/70",
    kind === "tool_error" && "text-red-400",
    kind === "user_input" && "text-amber-500",
    kind === "user_input_done" && "text-emerald-500",
    kind === "trace_done" && "text-emerald-500",
    kind === "trace_aborted" && "text-muted-foreground",
  );

  return (
    <span
      aria-hidden
      className={clsx(
        // 1.1rem 高图标 + top-[0.15rem] → 视觉中心位于 0.7rem (11.2px)
        // 与所有 step 内容统一的 leading-[1.4rem] 单行中心一致
        "absolute left-0 top-[0.15rem] flex h-[1.1rem] w-[1.1rem] items-center justify-center rounded-full bg-background ring-1",
        kind === "tool_error" || kind === "trace_aborted"
          ? "ring-red-200"
          : kind === "trace_done" || kind === "user_input_done"
            ? "ring-emerald-200"
            : kind === "user_input"
              ? "ring-amber-200"
            : "ring-[#e6ddd0]",
      )}
    >
      <Icon className={iconClass} />
    </span>
  );
}

"use client";

import clsx from "clsx";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import type { BrainstormStep } from "@/types/brainstorm";
import {
  runningToolLabel,
  toolAbortedLabel,
  toolFailureLabel,
  toolSuccessLabel,
} from "@/lib/brainstorm-utils";
import { TimelineNode, type TimelineNodeKind } from "./TimelineNode";
import { ThinkingMarkdown } from "./ThinkingMarkdown";

interface BrainstormStepItemProps {
  step: BrainstormStep;
  isFirst: boolean;
  /** 是否为 trace.steps 末尾；与 isStreaming 一起决定 thinking 是否显示光标 */
  isLast?: boolean;
  /** trace 是否仍在流式中 */
  isStreaming?: boolean;
  expanded: boolean;
  onToggle: () => void;
}

/**
 * 所有 step 统一布局：图标绝对定位在 left:0，内容左 pl-7。
 * 关键：所有内容（thinking / tool）的首行高度统一为 1.4rem
 * （leading-[1.4rem]），图标 1.1rem 高，top:0.15rem → 图标中心刚好落在首行中心。
 */
function StepShell({
  kind,
  isFirst,
  children,
}: {
  kind: TimelineNodeKind;
  isFirst: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={clsx("relative pl-7", isFirst ? "mt-2.5" : "mt-3")}>
      <TimelineNode kind={kind} />
      {children}
    </div>
  );
}

export function BrainstormStepItem({
  step,
  isFirst,
  isLast = false,
  isStreaming = false,
  expanded,
  onToggle,
}: BrainstormStepItemProps) {
  if (step.type === "thinking") {
    const active = step.durationSec == null && (isLast ? isStreaming : false);
    return (
      <StepShell kind={active ? "thinking_active" : "thinking"} isFirst={isFirst}>
        <ThinkingMarkdown content={step.content} active={active} />
      </StepShell>
    );
  }

  if (step.type === "user_input") {
    const answered = step.status === "answered" && !!step.answer?.trim();
    const dismissed = step.status === "dismissed";
    return (
      <StepShell
        kind={answered || dismissed ? "user_input_done" : "user_input"}
        isFirst={isFirst}
      >
        <div className="text-[13px] leading-[1.4rem] text-gray-600">
          <div className="font-medium text-amber-700/90">
            {answered
              ? "用户已补充"
              : dismissed
              ? "用户已跳过"
              : "等待用户补充"}
          </div>
          {step.question.trim() ? (
            <div className="mt-0.5 text-gray-500">{step.question}</div>
          ) : null}
          {answered ? (
            <div className="mt-1 rounded-md bg-emerald-50/70 px-2.5 py-1.5 text-emerald-800">
              {step.answer}
            </div>
          ) : null}
        </div>
      </StepShell>
    );
  }

  /* 工具行：极简一行 + 可展开 outputPreview */
  const failed = step.status === "error";
  const aborted = failed && step.aborted === true;
  const running = step.status === "running";
  const canExpand =
    step.status === "success" && !!(step.outputPreview ?? "").trim();

  const kind: TimelineNodeKind = running
    ? "tool_running"
    : failed
    ? "tool_error"
    : "tool";

  const toolLine = running
    ? runningToolLabel(step.toolName, step.mcpRemoteName)
    : aborted
    ? toolAbortedLabel(step.toolName, step.mcpRemoteName)
    : failed
    ? toolFailureLabel(step.toolName, step.mcpRemoteName)
    : toolSuccessLabel(
        step.toolName,
        step.outputPreview,
        undefined,
        undefined,
        step.mcpRemoteName,
      );

  const lineClass = clsx(
    // leading-[1.4rem] 与 thinking/interim 一致，使图标 top-[0.15rem] 居中于首行
    "relative flex w-fit max-w-full items-center gap-1.5 rounded-md px-1 text-left text-[13px] leading-[1.4rem] transition-colors",
    failed ? "text-gray-400 cursor-default" : "text-[#5b78ad]",
    canExpand && "cursor-pointer hover:bg-[#5b78ad]/[0.07]",
    !canExpand && !failed && "cursor-default",
  );

  const lineInner = (
    <>
      <span className="min-w-0 truncate">{toolLine}</span>
      {canExpand ? (
        <ChevronDown
          aria-hidden
          className={clsx(
            "h-3 w-3 shrink-0 text-[#5b78ad]/50 transition-transform duration-200",
            expanded && "rotate-180",
          )}
        />
      ) : null}
    </>
  );

  const title = step.mcpRemoteName ?? step.toolName;

  return (
    <StepShell kind={kind} isFirst={isFirst}>
      {canExpand ? (
        <button
          type="button"
          className={lineClass}
          aria-expanded={expanded}
          title={title}
          onClick={onToggle}
        >
          {lineInner}
        </button>
      ) : (
        <div className={lineClass} title={title}>
          {lineInner}
        </div>
      )}

      <AnimatePresence initial={false}>
        {canExpand && expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="mt-1.5 max-h-64 overflow-y-auto rounded-md bg-gray-50/60 px-3 py-2 text-[12.5px] leading-relaxed text-gray-600">
              <pre className="whitespace-pre-wrap break-words font-mono text-[12px]">
                {step.outputPreview ?? ""}
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </StepShell>
  );
}

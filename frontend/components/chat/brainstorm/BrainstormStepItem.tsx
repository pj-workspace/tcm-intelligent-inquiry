"use client";

import clsx from "clsx";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Loader2 } from "lucide-react";
import type { BrainstormStep } from "@/types/brainstorm";
import {
  runningToolLabel,
  toolFailureLabel,
  toolSuccessLabel,
  parseWebResults,
  parseSummaryBlocks,
} from "@/lib/brainstorm-utils";

interface BrainstormStepItemProps {
  step: BrainstormStep;
  isFirst: boolean;
  expanded: boolean;
  onToggle: () => void;
}

export function BrainstormStepItem({
  step,
  isFirst,
  expanded,
  onToggle,
}: BrainstormStepItemProps) {
  if (step.type === "thinking") {
    const active = step.durationSec == null;
    return (
      <div className={clsx("relative pl-3", isFirst ? "mt-2" : "mt-3")}>
        <p className="whitespace-pre-wrap text-[13px] italic leading-relaxed text-gray-500">
          {step.content}
          {active && (
            <span className="ml-1 inline-block h-3.5 w-1 animate-pulse bg-gray-400 align-middle" />
          )}
        </p>
      </div>
    );
  }

  /* 工具行：默认一行，成功后可展开看规整结果；失败不暴露后台错误 */
  const failed = step.status === "error";
  const webResults =
    step.toolName === "searx_web_search" && !failed
      ? parseWebResults(step.outputPreview)
      : [];
  const summaries =
    step.toolName !== "searx_web_search" && !failed
      ? parseSummaryBlocks(step.outputPreview)
      : [];
  const canExpand =
    step.status === "success" &&
    !failed &&
    (webResults.length > 0 || summaries.length > 0);

  const toolLine =
    step.status === "running"
      ? runningToolLabel(step.toolName, step.mcpRemoteName)
      : failed
      ? toolFailureLabel(step.toolName, step.mcpRemoteName)
      : toolSuccessLabel(
          step.toolName,
          step.outputPreview,
          webResults,
          summaries,
          step.mcpRemoteName
        );

  const lineClass = clsx(
    "relative flex w-fit max-w-full items-center gap-1.5 rounded-md px-1 py-0.5 text-left text-[13px] transition-colors",
    failed ? "text-gray-400 cursor-default" : "text-[#5b78ad]",
    canExpand && "cursor-pointer hover:bg-[#5b78ad]/[0.07]",
    !canExpand && !failed && "cursor-default"
  );

  const lineInner = (
    <>
      {step.status === "running" && (
        <Loader2 className="h-3 w-3 shrink-0 animate-spin text-[#5b78ad]/60" />
      )}
      <span className="min-w-0 truncate">{toolLine}</span>
      {canExpand ? (
        <ChevronDown
          aria-hidden
          className={clsx(
            "h-3 w-3 shrink-0 text-[#5b78ad]/50 transition-transform duration-200",
            expanded && "rotate-180"
          )}
        />
      ) : null}
    </>
  );

  return (
    <div className={clsx("relative pl-3", isFirst ? "mt-2" : "mt-2.5")}>
      {canExpand ? (
        <button
          type="button"
          className={lineClass}
          aria-expanded={expanded}
          title={step.mcpRemoteName ?? step.toolName}
          onClick={onToggle}
        >
          {lineInner}
        </button>
      ) : (
        <div className={lineClass} title={step.mcpRemoteName ?? step.toolName}>
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
            <div className="mt-1.5 max-h-64 overflow-y-auto pl-1 pr-2 text-[13px] leading-relaxed text-gray-500">
              {webResults.length > 0 ? (
                <ol className="space-y-1.5">
                  {webResults.map((item, itemIdx) => (
                    <li key={`${item.title}-${itemIdx}`} className="flex gap-2">
                      <span className="shrink-0 tabular-nums text-gray-400">
                        {itemIdx + 1}.
                      </span>
                      {item.url ? (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="min-w-0 text-gray-600 underline-offset-4 hover:text-[#5b78ad] hover:underline"
                        >
                          {item.title} ↗
                        </a>
                      ) : (
                        <span>{item.title}</span>
                      )}
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="space-y-2">
                  {summaries.map((summary, summaryIdx) => (
                    <p
                      key={`${summary}-${summaryIdx}`}
                      className="border-l border-[#e2d8ca] pl-3 text-gray-500"
                    >
                      {summary}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

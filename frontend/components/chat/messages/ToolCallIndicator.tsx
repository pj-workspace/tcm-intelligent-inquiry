/**
 * @fileoverview 工具调用进行中/成功/失败的状态条（SSE tool_call 事件的可视反馈）。
 */
"use client";

import { motion } from "framer-motion";
import { Wrench, Check, Loader2 } from "lucide-react";
import clsx from "clsx";

interface ToolCallIndicatorProps {
  toolName: string;
  status: "running" | "success" | "error";
  args?: unknown;
}

/** 展示单次工具调用的运行态与结果态（running 带扫光动画）。 */
export function ToolCallIndicator({ toolName, status }: ToolCallIndicatorProps) {
  const isRunning = status === "running";

  return (
    <div className="flex gap-4 w-full max-w-3xl mx-auto py-2 px-4 md:px-0 justify-start">
      <motion.div
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-2 max-w-[85%]"
      >
        <motion.div
          className={clsx(
            "flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-[13px] border transition-colors relative overflow-hidden",
            isRunning
              ? "bg-muted border-orange-200/80 text-foreground shadow-[0_0_0_1px_rgba(251,146,60,0.15)]"
              : status === "success"
              ? "bg-surface border-border text-muted-foreground shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
              : "bg-red-50 border-red-100 text-red-600"
          )}
          animate={
            isRunning
              ? { boxShadow: ["0 0 0 0px rgba(251,146,60,0)", "0 0 0 3px rgba(251,146,60,0.12)", "0 0 0 0px rgba(251,146,60,0)"] }
              : undefined
          }
          transition={
            isRunning
              ? { duration: 1.4, repeat: Infinity, ease: "easeInOut" }
              : undefined
          }
        >
          {isRunning && (
            <motion.div
              className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-orange-100/40 to-transparent"
              animate={{ x: ["-100%", "100%"] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
            />
          )}
          <span className="relative z-10 flex items-center gap-2.5">
            {isRunning ? (
              <Loader2 className="w-4 h-4 animate-spin text-orange-500 shrink-0" />
            ) : status === "success" ? (
              <Check className="w-4 h-4 text-green-500 shrink-0" />
            ) : (
              <Wrench className="w-4 h-4 text-red-500 shrink-0" />
            )}
            <span className="flex items-center gap-1.5 flex-wrap">
              <span className="text-muted-foreground">
                {isRunning
                  ? "正在调用工具"
                  : status === "success"
                  ? "工具调用成功"
                  : "工具调用失败"}
              </span>
              <span className="text-muted-foreground/40">·</span>
              <span className="font-mono text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md">
                {toolName}
              </span>
            </span>
          </span>
        </motion.div>
      </motion.div>
    </div>
  );
}

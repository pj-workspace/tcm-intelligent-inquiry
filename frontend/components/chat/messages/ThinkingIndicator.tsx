/**
 * @fileoverview 助手「思考过程」可折叠指示器（流式 thinking 与结束后时长展示）。
 */
"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, BrainCircuit } from "lucide-react";

/** 将思考时长格式化为短字符串（秒，一位小数或整数）。 */
function formatDurationSec(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0s";
  if (sec < 10) return `${Math.round(sec * 10) / 10}s`;
  return `${Math.round(sec)}s`;
}

interface ThinkingIndicatorProps {
  content: string;
  isThinking: boolean;
  /** 已结束时的时长（秒），来自服务端或前端结算 */
  durationSec?: number;
}

/** 可展开/收起的 thinking 区块；流式时默认展开并显示脉冲光标。 */
export function ThinkingIndicator({
  content,
  isThinking,
  durationSec,
}: ThinkingIndicatorProps) {
  const [isOpen, setIsOpen] = useState(isThinking);

  useEffect(() => {
    setIsOpen(isThinking);
  }, [isThinking]);

  return (
    <div className="flex gap-4 w-full max-w-3xl mx-auto py-2 px-4 md:px-0 justify-start">
      <div className="flex flex-col gap-2 max-w-[85%] w-full">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 rounded-md px-1 py-0.5 text-[13px] font-medium text-gray-500 hover:bg-gray-100/80 hover:text-gray-700 transition-colors w-fit min-w-0 group -ml-1"
        >
          <motion.div
            animate={{ rotate: isOpen ? 0 : -90 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
          >
            <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
          </motion.div>
          <BrainCircuit
            className={`w-4 h-4 shrink-0 ${isThinking ? "animate-pulse text-orange-500" : "text-gray-400"}`}
          />
          <span>
            {isThinking ? (
              "思考中..."
            ) : durationSec != null ? (
              <>
                思考过程{" "}
                <span className="tabular-nums text-gray-500">
                  {formatDurationSec(durationSec)}
                </span>
              </>
            ) : (
              "思考过程"
            )}
          </span>
        </button>

        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.4, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div className="pl-4 border-l-2 border-[#e5e5e5] py-2 my-1 ml-1.5">
                <p className="text-[14px] text-gray-500 italic leading-relaxed whitespace-pre-wrap font-serif">
                  {content}
                  {isThinking && (
                    <span className="inline-block w-1.5 h-4 ml-1 bg-gray-400 animate-pulse align-middle" />
                  )}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

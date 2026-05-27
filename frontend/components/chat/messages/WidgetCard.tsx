/**
 * @fileoverview Agent `ask_user` 交互卡片：选项、自由文本与跳过。
 */
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Check, PenLine, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface WidgetCardProps {
  question: string;
  choices: string[];
  allowFreeText: boolean;
  /** 已作答则非空 */
  answer?: string;
  /** 已跳过 */
  dismissed?: boolean;
  /** 生成中或已作答/跳过时禁用 */
  disabled?: boolean;
  onAnswer: (answer: string | null) => void;
}

/** 追问 Widget：未答时展示选项/自由输入，已答后紧凑展示选择结果。 */
export function WidgetCard({
  question,
  choices,
  allowFreeText,
  answer,
  dismissed,
  disabled = false,
  onAnswer,
}: WidgetCardProps) {
  const answered = answer !== undefined || dismissed;
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [freeText, setFreeText] = useState("");
  const [showFreeInput, setShowFreeInput] = useState(false);
  const freeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showFreeInput) freeInputRef.current?.focus();
  }, [showFreeInput]);

  /** 点选预设选项。 */
  const handleChoice = useCallback(
    (label: string) => {
      if (disabled || answered) return;
      onAnswer(label);
    },
    [disabled, answered, onAnswer],
  );

  /** 提交自由文本答案。 */
  const handleFreeSubmit = useCallback(() => {
    const t = freeText.trim();
    if (!t || disabled || answered) return;
    onAnswer(t);
  }, [freeText, disabled, answered, onAnswer]);

  /** 跳过 Widget（传 null）。 */
  const handleSkip = useCallback(() => {
    if (disabled || answered) return;
    onAnswer(null);
  }, [disabled, answered, onAnswer]);

  /* keyboard nav on choice list */
  useEffect(() => {
    if (answered || disabled || showFreeInput) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHoveredIdx((i) => (i === null ? 0 : Math.min(i + 1, choices.length - 1)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHoveredIdx((i) => (i === null ? choices.length - 1 : Math.max(i - 1, 0)));
      } else if (e.key === "Enter" && hoveredIdx !== null) {
        e.preventDefault();
        handleChoice(choices[hoveredIdx]);
      } else if (e.key === "Escape") {
        handleSkip();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [answered, disabled, showFreeInput, hoveredIdx, choices, handleChoice, handleSkip]);

  /* ── 已作答/跳过后显示紧凑状态 ─────────────────────────────── */
  if (answered) {
    const label = dismissed ? "已跳过" : answer!;
    return (
      <div className="my-3 w-full max-w-3xl lg:max-w-4xl xl:max-w-5xl mx-auto px-4 sm:px-5 md:px-6 lg:px-8">
        <div className="flex items-start gap-3 rounded-xl border border-border bg-muted px-4 py-3">
          <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100">
            <Check className="h-3 w-3 text-emerald-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-muted-foreground leading-snug">{question}</p>
            <p
              className={`mt-0.5 text-[14px] font-medium leading-snug ${
                dismissed ? "italic text-muted-foreground" : "text-foreground"
              }`}
            >
              {label}
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* ── 交互状态 ──────────────────────────────────────────────── */
  return (
    <div className="my-4 w-full max-w-3xl lg:max-w-4xl xl:max-w-5xl mx-auto px-4 sm:px-5 md:px-6 lg:px-8">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm"
      >
        {/* 问题头 */}
        <div className="border-b border-border px-5 py-4">
          <p className="text-[15px] font-semibold leading-snug text-foreground">{question}</p>
        </div>

        {/* 选项列表 */}
        <ul className="divide-y divide-gray-100">
          {choices.map((label, idx) => {
            const isHovered = hoveredIdx === idx;
            return (
              <li key={idx}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => handleChoice(label)}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  className={`flex w-full items-center gap-3 px-5 py-3 text-left transition-colors disabled:pointer-events-none disabled:opacity-50 ${
                    isHovered ? "bg-muted" : "bg-surface"
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[12px] font-semibold tabular-nums transition-colors ${
                      isHovered
                        ? "bg-gray-800 text-white"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {idx + 1}
                  </span>
                  <span className="flex-1 text-[14px] text-foreground">{label}</span>
                  {isHovered && (
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                </button>
              </li>
            );
          })}

          {/* 自由填写行 */}
          {allowFreeText && (
            <li>
              <AnimatePresence initial={false}>
                {showFreeInput ? (
                  <motion.div
                    key="input"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-center gap-2 bg-muted px-5 py-3"
                  >
                    <PenLine className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <input
                      ref={freeInputRef}
                      type="text"
                      placeholder="输入你的回答…"
                      value={freeText}
                      disabled={disabled}
                      onChange={(e) => setFreeText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleFreeSubmit();
                        if (e.key === "Escape") {
                          setShowFreeInput(false);
                          setFreeText("");
                        }
                      }}
                      className="flex-1 bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted-foreground"
                    />
                    <button
                      type="button"
                      onClick={handleFreeSubmit}
                      disabled={!freeText.trim() || disabled}
                      className="rounded-md bg-gray-800 px-3 py-1 text-[12px] font-medium text-white transition-opacity disabled:opacity-40 hover:opacity-90"
                    >
                      发送
                    </button>
                  </motion.div>
                ) : (
                  <motion.button
                    key="trigger"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    type="button"
                    disabled={disabled}
                    onClick={() => setShowFreeInput(true)}
                    onMouseEnter={() => setHoveredIdx(null)}
                    className="flex w-full items-center gap-3 bg-surface px-5 py-3 text-left transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted">
                      <PenLine className="h-3.5 w-3.5 text-muted-foreground" />
                    </span>
                    <span className="flex-1 text-[14px] text-muted-foreground italic">
                      自定义回答…
                    </span>
                  </motion.button>
                )}
              </AnimatePresence>
            </li>
          )}
        </ul>

        {/* 底部跳过 */}
        <div className="flex items-center justify-end border-t border-border px-5 py-2.5">
          <button
            type="button"
            disabled={disabled}
            onClick={handleSkip}
            className="text-[12px] text-muted-foreground transition-colors hover:text-muted-foreground disabled:opacity-40"
          >
            跳过
          </button>
        </div>
      </motion.div>
    </div>
  );
}

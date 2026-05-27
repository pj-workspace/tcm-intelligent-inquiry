/**
 * @fileoverview 助手回复气泡：Markdown 渲染、引用角标、工具栏与追问区。
 */
"use client";

import type { RefObject } from "react";
import { useMemo, useState } from "react";
import clsx from "clsx";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import {
  Copy,
  Check,
  MoreVertical,
  RefreshCw,
  Volume2,
  Square,
  FileDown,
  Sparkles,
} from "lucide-react";
import {
  assistantMarkdownComponents,
  injectCitationMarkdownLinks,
  preprocessAssistantMarkdown,
  exportAssistantAsPdf,
} from "@/lib/markdown-utils";
import type { CitationSource } from "@/types/chat";
import {
  CitationMarker,
  CitationSourcePanel,
  CitationSourcesButton,
} from "./CitationSources";

/** 较慢、末尾更柔和的缓动（ease-out） */
const softEase = [0.33, 1, 0.68, 1] as const;

/** 入场整体快约 0.4s，但不短于阈值以免「闪糊」 */
const ENTER_FAST_BY = 0.4;
const enterSecs = (base: number) => Math.max(0.14, Number((base - ENTER_FAST_BY).toFixed(2)));

/** 消失：极低时长线性，接近瞬切 */
const exitSnapTransition = { duration: 0.04, ease: "linear" as const };

/** 追问条前导「回车」符（16×16） */
/** 追问条前导「回车」SVG 图标。 */
function FollowUpEnterIcon({ className }: { className?: string }) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <path
        d="M2.7998 3.90039C3.07595 3.90039 3.2998 4.12425 3.2998 4.40039V6.40039C3.2998 7.44973 4.15085 8.30078 5.2002 8.30078H11.9941L10.0469 6.35352L9.98242 6.27539C9.85456 6.08135 9.87613 5.81723 10.0469 5.64648C10.2176 5.47584 10.4818 5.45416 10.6758 5.58203L10.7539 5.64648L13.5537 8.44629C13.5595 8.4521 13.5639 8.45981 13.5693 8.46582C13.5804 8.47802 13.5908 8.49066 13.6006 8.50391C13.6096 8.51608 13.6182 8.52825 13.626 8.54102C13.6337 8.55358 13.6399 8.56682 13.6465 8.58008C13.6536 8.59442 13.6614 8.60822 13.667 8.62305C13.6726 8.63764 13.6765 8.65276 13.6807 8.66797C13.6845 8.68197 13.6888 8.69574 13.6914 8.70996C13.6968 8.73945 13.7002 8.76974 13.7002 8.80078V8.80566C13.6998 8.84424 13.6929 8.88225 13.6836 8.91992C13.6786 8.94025 13.6734 8.96023 13.666 8.97949C13.6616 8.99091 13.6556 9.00156 13.6504 9.0127C13.6423 9.02981 13.6339 9.04652 13.624 9.0625C13.6177 9.07262 13.6106 9.08205 13.6035 9.0918C13.5911 9.10894 13.5779 9.12521 13.5635 9.14062C13.5598 9.14449 13.5575 9.14954 13.5537 9.15332L10.7539 11.9531C10.5586 12.1484 10.2421 12.1484 10.0469 11.9531C9.85214 11.7578 9.85179 11.4412 10.0469 11.2461L11.9922 9.30078H5.2002C3.59857 9.30078 2.2998 8.00202 2.2998 6.40039V4.40039C2.2998 4.12425 2.52366 3.90039 2.7998 3.90039Z"
        fill="currentColor"
      />
    </svg>
  );
}

interface AssistantBubbleProps {
  content: string;
  modelName?: string;
  assistantActionsDisabled?: boolean;
  onAssistantRegenerate?: () => void;
  /** 服务端已返回追问条；仅在有内容时渲染，请求中不出现骨架 */
  followUpItems?: string[];
  citations?: CitationSource[];
  onFollowUpClick?: (text: string) => void;
  noTopPad?: boolean;
  noBottomPad?: boolean;
  interrupted?: boolean;
  copied: boolean;
  onCopy: () => void;
  ttsPlaying: boolean;
  onToggleTts: () => void;
  menuOpen: boolean;
  onMenuToggle: () => void;
  menuRef: RefObject<HTMLDivElement | null>;
  /** 最后一条助手：生成中用与工具栏等高的占位，避免 idle 时出现条儿时正文整体猛跳 */
  assistantToolbarReserve?: boolean;
  /** 工具调用拆段时隐藏中间段的复制/朗读等，仅在末段展示 */
  suppressAssistantToolbar?: boolean;
  /** 输出完成后才展示引用来源入口（流式生成中隐藏） */
  showCitationSources?: boolean;
}

/** 近似 3 条追问骨架/按钮纵向占位，仅在追问展示期间起效，减少对贴底滚动时的视感位移 */
const FOLLOW_UP_TRAY_MIN_H = "min-h-[9.75rem]";

/** 助手 Markdown 气泡：引用角标、工具栏、追问与 PDF 导出。 */
export function AssistantBubble({
  content,
  modelName,
  assistantActionsDisabled,
  onAssistantRegenerate,
  followUpItems,
  onFollowUpClick,
  noTopPad,
  noBottomPad,
  interrupted,
  copied,
  onCopy,
  ttsPlaying,
  onToggleTts,
  menuOpen,
  onMenuToggle,
  menuRef,
  assistantToolbarReserve,
  suppressAssistantToolbar,
  citations,
  showCitationSources,
}: AssistantBubbleProps) {
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const showFollowUpRegion = !!(
    followUpItems &&
    followUpItems.length > 0 &&
    onFollowUpClick
  );

  const showToolbarReserve =
    assistantActionsDisabled && assistantToolbarReserve === true;
  const citationById = useMemo(() => {
    const map = new Map<string, CitationSource>();
    for (const item of citations ?? []) map.set(item.id, item);
    return map;
  }, [citations]);
  // citation: 伪协议链接 → CitationMarker；其余链接走 defaultUrlTransform + 新窗口打开。
  const markdownComponents = useMemo<Components>(() => {
    return {
      ...assistantMarkdownComponents,
      a: ({ node, href, children, ...props }) => {
        void node;
        if (typeof href === "string" && href.startsWith("citation:")) {
          const id = decodeURIComponent(href.slice("citation:".length));
          return (
            <CitationMarker
              id={id}
              source={citationById.get(id)}
              onOpenPanel={() => setSourcesOpen(true)}
            />
          );
        }
        return (
          <a href={href} target="_blank" rel="noreferrer" {...props}>
            {children}
          </a>
        );
      },
    };
  }, [citationById]);
  const renderedContent = preprocessAssistantMarkdown(
    injectCitationMarkdownLinks(
      content + (interrupted ? "\n\n> *输出已被终止*" : ""),
    ),
  );

  return (
    <div
      className={clsx(
        "flex w-full max-w-3xl lg:max-w-4xl xl:max-w-5xl mx-auto px-4 sm:px-5 md:px-6 lg:px-8 justify-start",
        noTopPad ? "pt-1.5" : "pt-3",
        noBottomPad ? "pb-2" : "pb-3",
      )}
    >
      <div className="flex min-w-0 w-full max-w-full flex-col items-start gap-1.5">
        <div
          className={clsx(
            "text-[15px] leading-relaxed bg-transparent text-foreground ai-content w-full min-w-0 md:max-w-[68ch] lg:max-w-[80ch] xl:max-w-[96ch]",
          )}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={markdownComponents}
            urlTransform={(url) =>
              url.startsWith("citation:") ? url : defaultUrlTransform(url)
            }
          >
            {renderedContent}
          </ReactMarkdown>
        </div>

        <div className="flex w-full flex-col items-start gap-2">
          {!suppressAssistantToolbar &&
            (showToolbarReserve ? (
            <div
              aria-hidden
              className="pointer-events-none mt-0.5 min-h-[2.375rem] w-full shrink-0"
            />
          ) : !assistantActionsDisabled ? (
            <div className="mt-0.5 flex w-full flex-wrap items-center gap-0.5">
            <button
              type="button"
              disabled={!onAssistantRegenerate}
              onClick={onAssistantRegenerate}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/5 disabled:opacity-40 disabled:pointer-events-none transition-colors"
              title="重新生成"
              aria-label="重新生成"
            >
              <RefreshCw className="w-4 h-4" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={onCopy}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
              title={copied ? "已复制" : "复制"}
              aria-label={copied ? "已复制" : "复制"}
            >
              {copied ? (
                <Check className="w-4 h-4 text-green-600" strokeWidth={1.75} />
              ) : (
                <Copy className="w-4 h-4" strokeWidth={1.75} />
              )}
            </button>
            <button
              type="button"
              onClick={onToggleTts}
              className={clsx(
                "p-1.5 rounded-lg transition-colors",
                ttsPlaying
                  ? "text-orange-600 bg-orange-50 hover:bg-orange-100"
                  : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
              )}
              title={ttsPlaying ? "停止朗读" : "朗读"}
              aria-label={ttsPlaying ? "停止朗读" : "朗读"}
              aria-pressed={ttsPlaying}
            >
              {ttsPlaying ? (
                <Square className="w-4 h-4" strokeWidth={1.75} />
              ) : (
                <Volume2 className="w-4 h-4" strokeWidth={1.75} />
              )}
            </button>

            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={onMenuToggle}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
                title="更多"
                aria-expanded={menuOpen}
                aria-label="更多选项"
              >
                <MoreVertical className="w-4 h-4" strokeWidth={1.75} />
              </button>
              {menuOpen && (
                <div
                  className="absolute left-0 bottom-full mb-1 z-50 min-w-[220px] rounded-xl border border-border bg-surface py-1 shadow-lg text-sm"
                  role="menu"
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-foreground transition-colors hover:bg-muted active:bg-muted/80"
                    onClick={() => {
                      onMenuToggle();
                      exportAssistantAsPdf("TCM AI 回复", content);
                    }}
                  >
                    <FileDown className="w-4 h-4 shrink-0 opacity-70" />
                    导出为 PDF
                  </button>
                  <div className="my-1 h-px bg-border" />
                  <div className="flex items-start gap-2 px-3 py-2.5 text-muted-foreground">
                    <Sparkles className="w-4 h-4 shrink-0 mt-0.5 opacity-70" />
                    <div>
                      <div className="text-xs text-muted-foreground mb-0.5">本回复所用模型</div>
                      <div className="text-[13px] text-foreground font-medium leading-snug break-all">
                        {modelName?.trim() || "—"}
                      </div>
                      <div className="mt-1 text-[11px] leading-snug text-muted-foreground">
                        切换模型请在输入栏左侧选择
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            {showCitationSources && citations && citations.length > 0 ? (
              <CitationSourcesButton
                count={citations.length}
                onClick={() => setSourcesOpen(true)}
              />
            ) : null}
          </div>
          ) : null)}

          <AnimatePresence initial={false}>
            {showFollowUpRegion ? (
              <motion.div
                key="follow-tray-wrap"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6, transition: exitSnapTransition }}
                transition={{
                  duration: enterSecs(0.7),
                  ease: softEase,
                }}
                className={clsx(
                  "mt-2 flex w-full flex-col items-start gap-2 md:max-w-[68ch]",
                  FOLLOW_UP_TRAY_MIN_H,
                )}
              >
                <div className="flex flex-col items-start gap-2">
                  {(followUpItems ?? []).map((text, idx) => (
                    <button
                      key={`${idx}-${text.slice(0, 24)}`}
                      type="button"
                      onClick={() => onFollowUpClick?.(text)}
                      className={clsx(
                        "inline-flex max-w-[min(100%,26rem)] w-fit shrink-0 items-start gap-2 rounded-2xl border border-border bg-surface px-3 py-2.5",
                        "text-left text-[13px] leading-snug text-foreground",
                        "shadow-[0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-none",
                        "hover:border-orange-300/40 hover:bg-muted hover:shadow-sm",
                        "active:scale-[0.995] transition-[transform,background-color,border-color,box-shadow] duration-150",
                      )}
                    >
                      <FollowUpEnterIcon className="mt-[3px] h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 break-words">{text}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
      {citations && citations.length > 0 ? (
        <CitationSourcePanel
          sources={citations}
          open={sourcesOpen}
          onClose={() => setSourcesOpen(false)}
        />
      ) : null}
    </div>
  );
}

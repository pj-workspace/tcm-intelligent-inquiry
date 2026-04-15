"use client";

import clsx from "clsx";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Copy,
  Check,
  MoreVertical,
  Pencil,
  RefreshCw,
  Volume2,
  Square,
  FileDown,
  Sparkles,
} from "lucide-react";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 用于复制 / 朗读 / PDF 的纯文本（弱化 Markdown 标记） */
export function markdownToPlainText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, "\n")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^#+\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function exportAssistantAsPdf(title: string, markdown: string) {
  const plain = markdownToPlainText(markdown);
  const w = window.open("", "_blank");
  if (!w) return;
  const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(
    title
  )}</title><style>
    body{font-family:system-ui,sans-serif;padding:28px;max-width:720px;margin:0 auto;color:#111;line-height:1.6}
    h1{font-size:1.25rem;font-weight:600;margin:0 0 16px}
    pre{white-space:pre-wrap;word-break:break-word;font-size:14px;margin:0}
    @media print{body{padding:16px}}
  </style></head><body>
  <h1>${escapeHtml(title)}</h1>
  <pre>${escapeHtml(plain)}</pre>
  <script>window.onload=function(){window.print();}</script>
  </body></html>`;
  w.document.write(doc);
  w.document.close();
}


interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  /** 助手消息：后端 SSE meta.chatModel */
  modelName?: string;
  assistantActionsDisabled?: boolean;
  onAssistantRegenerate?: () => void;
  /** 用户消息：将内容填入输入框 */
  onUserEdit?: (text: string) => void;
}

export function MessageBubble({
  role,
  content,
  modelName,
  assistantActionsDisabled,
  onAssistantRegenerate,
  onUserEdit,
}: MessageBubbleProps) {
  const isUser = role === "user";
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [ttsPlaying, setTtsPlaying] = useState(false);
  const ttsPlayingRef = useRef(false);
  const [copied, setCopied] = useState(false);

  const plain = markdownToPlainText(content);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(isUser ? content : plain);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }, [content, isUser, plain]);

  const toggleReadAloud = useCallback(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const text = plain || content;
    if (!text.trim()) return;

    if (ttsPlayingRef.current) {
      window.speechSynthesis.cancel();
      ttsPlayingRef.current = false;
      setTtsPlaying(false);
      return;
    }

    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "zh-CN";
    u.onend = () => {
      ttsPlayingRef.current = false;
      setTtsPlaying(false);
    };
    u.onerror = () => {
      ttsPlayingRef.current = false;
      setTtsPlaying(false);
    };
    window.speechSynthesis.speak(u);
    ttsPlayingRef.current = true;
    setTtsPlaying(true);
  }, [plain, content]);

  useEffect(() => {
    const t = window.setInterval(() => {
      if (
        ttsPlayingRef.current &&
        !window.speechSynthesis.speaking &&
        !window.speechSynthesis.pending
      ) {
        ttsPlayingRef.current = false;
        setTtsPlaying(false);
      }
    }, 400);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  if (isUser) {
    return (
      <div
        className={clsx(
          "flex w-full max-w-3xl mx-auto py-4 px-4 md:px-0",
          "justify-end"
        )}
      >
        <div className="flex flex-row-reverse items-start gap-2 group max-w-[85%]">
          <div
            className={clsx(
              "text-[15px] leading-relaxed",
              "bg-[#f4f4f4] text-[#1a1a1a] rounded-2xl rounded-tr-sm px-5 py-3.5"
            )}
          >
            {content}
          </div>
          <div
            className="flex flex-row items-center gap-0.5 pt-1 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-150 shrink-0"
            aria-hidden
          >
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="p-1.5 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-black/5 transition-colors"
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
              onClick={() => onUserEdit?.(content)}
              className="p-1.5 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-black/5 transition-colors"
              title="填入输入框编辑"
              aria-label="填入输入框编辑"
            >
              <Pencil className="w-4 h-4" strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-3xl mx-auto py-4 px-4 md:px-0 justify-start">
      <div className="flex flex-col gap-2 max-w-[85%] items-start w-full">
        <div className="text-[15px] leading-relaxed bg-transparent text-[#1a1a1a] ai-content w-full">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>

        <div className="flex flex-wrap items-center gap-0.5 mt-1">
          <button
            type="button"
            disabled={assistantActionsDisabled || !onAssistantRegenerate}
            onClick={onAssistantRegenerate}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-black/5 disabled:opacity-40 disabled:pointer-events-none transition-colors"
            title="重新生成"
            aria-label="重新生成"
          >
            <RefreshCw className="w-4 h-4" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-black/5 transition-colors"
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
            onClick={toggleReadAloud}
            className={clsx(
              "p-1.5 rounded-lg transition-colors",
              ttsPlaying
                ? "text-orange-600 bg-orange-50 hover:bg-orange-100"
                : "text-gray-500 hover:text-gray-800 hover:bg-black/5"
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
              onClick={() => setMenuOpen((o) => !o)}
              className="p-1.5 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-black/5 transition-colors"
              title="更多"
              aria-expanded={menuOpen}
              aria-label="更多选项"
            >
              <MoreVertical className="w-4 h-4" strokeWidth={1.75} />
            </button>
            {menuOpen && (
              <div
                className="absolute left-0 bottom-full mb-1 z-50 min-w-[220px] rounded-xl border border-[#e8e8e8] bg-white py-1 shadow-lg text-sm"
                role="menu"
              >
                <button
                  type="button"
                  role="menuitem"
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-gray-700 hover:bg-gray-50"
                  onClick={() => {
                    setMenuOpen(false);
                    exportAssistantAsPdf("TCM AI 回复", content);
                  }}
                >
                  <FileDown className="w-4 h-4 shrink-0 opacity-70" />
                  导出为 PDF
                </button>
                <div className="my-1 h-px bg-[#eee]" />
                <div className="flex items-start gap-2 px-3 py-2.5 text-gray-500">
                  <Sparkles className="w-4 h-4 shrink-0 mt-0.5 opacity-70" />
                  <div>
                    <div className="text-xs text-gray-400 mb-0.5">模型</div>
                    <div className="text-[13px] text-gray-800 font-medium leading-snug break-all">
                      {modelName?.trim() || "—"}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

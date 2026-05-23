/**
 * @fileoverview trace 内 thinking 步骤的 Markdown 渲染（弱化样式，不解析引用角标）。
 */
"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { preprocessAssistantMarkdown } from "@/lib/markdown-utils";

/** trace 内 thinking 步骤的 markdown 渲染样式（弱化、紧凑，首块去顶部 margin 与图标对齐）。 */
const thinkingComponents: Components = {
  p: ({ node: _n, children, ...props }) => (
    <p
      className="my-1 whitespace-pre-wrap first:mt-0 last:mb-0"
      {...props}
    >
      {children}
    </p>
  ),
  ul: ({ node: _n, children, ...props }) => (
    <ul className="my-1 list-disc pl-5 first:mt-0 last:mb-0" {...props}>
      {children}
    </ul>
  ),
  ol: ({ node: _n, children, ...props }) => (
    <ol className="my-1 list-decimal pl-5 first:mt-0 last:mb-0" {...props}>
      {children}
    </ol>
  ),
  li: ({ node: _n, children, ...props }) => (
    <li className="my-0.5" {...props}>
      {children}
    </li>
  ),
  code: ({ node: _n, className, children, ...props }) => {
    const isBlock = /\blanguage-/.test(className ?? "");
    if (isBlock) {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code
        className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[12px] text-gray-700"
        {...props}
      >
        {children}
      </code>
    );
  },
  pre: ({ node: _n, children, ...props }) => (
    <pre
      className="my-1.5 max-w-full overflow-x-auto rounded-md bg-gray-50/80 p-2.5 font-mono text-[12px] leading-relaxed text-gray-700 first:mt-0 last:mb-0"
      {...props}
    >
      {children}
    </pre>
  ),
  strong: ({ node: _n, children, ...props }) => (
    <strong className="font-semibold text-gray-700" {...props}>
      {children}
    </strong>
  ),
  em: ({ node: _n, children, ...props }) => (
    <em className="italic" {...props}>
      {children}
    </em>
  ),
  blockquote: ({ node: _n, children, ...props }) => (
    <blockquote
      className="my-1 border-l-2 border-[#e2d8ca] pl-2.5 text-gray-500 first:mt-0 last:mb-0"
      {...props}
    >
      {children}
    </blockquote>
  ),
  h1: ({ node: _n, children, ...props }) => (
    <h4
      className="my-1 text-[13.5px] font-semibold text-gray-700 first:mt-0 last:mb-0"
      {...props}
    >
      {children}
    </h4>
  ),
  h2: ({ node: _n, children, ...props }) => (
    <h4
      className="my-1 text-[13.5px] font-semibold text-gray-700 first:mt-0 last:mb-0"
      {...props}
    >
      {children}
    </h4>
  ),
  h3: ({ node: _n, children, ...props }) => (
    <h4
      className="my-1 text-[13px] font-semibold text-gray-700 first:mt-0 last:mb-0"
      {...props}
    >
      {children}
    </h4>
  ),
  h4: ({ node: _n, children, ...props }) => (
    <h4
      className="my-1 text-[13px] font-semibold text-gray-700 first:mt-0 last:mb-0"
      {...props}
    >
      {children}
    </h4>
  ),
  a: ({ node: _n, children, ...props }) => (
    <a
      className="text-[#5b78ad] underline-offset-4 hover:underline"
      target="_blank"
      rel="noreferrer"
      {...props}
    >
      {children}
    </a>
  ),
  hr: () => <hr className="my-2 border-[#eee5d5]" />,
};

interface ThinkingMarkdownProps {
  content: string;
  /** 历史保留参数：流式中是否激活。当前不再渲染竖线光标
   *  （内容含表格/列表等块级元素时光标会被推到新行，体验差）；
   *  正在流式的视觉信号由 TimelineNode 的 spinner + ClaudeStar 兜底。 */
  active?: boolean;
}

/** 软截断阈值（px）：~6 行 × 1.4rem × 16px ≈ 134px，留点余量到 144。
 *  对中文 / markdown 混排比 line-clamp 稳定（line-clamp 对中文换行表现差）。 */
const SOFT_MAX_HEIGHT_PX = 144;
/** 内容溢出判断的容差，避免恰好等高时也显示 Show more 按钮 */
const SOFT_MAX_OVERFLOW_BUFFER_PX = 24;

/** trace 内 thinking 段 Markdown：软截断 + 展开（流式时持续测量高度）。 */
export function ThinkingMarkdown({
  content,
  active: _activeUnused = false,
}: ThinkingMarkdownProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [needClamp, setNeedClamp] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // 流式内容会不断追加；用 layoutEffect 在每次 paint 前重新量高度
  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    // 临时去掉 maxHeight 来测真实高度
    const prevMaxHeight = el.style.maxHeight;
    el.style.maxHeight = "none";
    const overflow = el.scrollHeight > SOFT_MAX_HEIGHT_PX + SOFT_MAX_OVERFLOW_BUFFER_PX;
    el.style.maxHeight = prevMaxHeight;
    setNeedClamp(overflow);
  }, [content]);

  // 内容缩短到不再溢出时把 expanded 状态复位（少见但稳妥）
  useEffect(() => {
    if (!needClamp && expanded) setExpanded(false);
  }, [needClamp, expanded]);

  const clampActive = needClamp && !expanded;

  return (
    <div
      // 统一 leading-[1.4rem]：与 TimelineNode top-[0.15rem] 配合让图标视觉中心
      // 与首行中心同高（图标中心 = 1.4rem × 0.5 = 0.7rem）
      className="text-[13px] leading-[1.4rem] text-gray-500"
    >
      <div
        ref={contentRef}
        style={{
          maxHeight: clampActive ? SOFT_MAX_HEIGHT_PX : undefined,
          overflow: clampActive ? "hidden" : undefined,
          WebkitMaskImage: clampActive
            ? "linear-gradient(to bottom, #000 70%, transparent)"
            : undefined,
          maskImage: clampActive
            ? "linear-gradient(to bottom, #000 70%, transparent)"
            : undefined,
        }}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={thinkingComponents}>
          {preprocessAssistantMarkdown(content)}
        </ReactMarkdown>
      </div>
      {needClamp && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-[12px] text-gray-400 transition-colors hover:text-gray-600"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

"use client";

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
  /** 正在流式输入时显示光标 */
  active?: boolean;
}

export function ThinkingMarkdown({ content, active = false }: ThinkingMarkdownProps) {
  return (
    <div
      // 统一 leading-[1.4rem]：与 TimelineNode top-[0.15rem] 配合让图标视觉中心
      // 与首行中心同高（图标中心 = 1.4rem × 0.5 = 0.7rem）
      className="text-[13px] leading-[1.4rem] text-gray-500"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={thinkingComponents}>
        {preprocessAssistantMarkdown(content)}
      </ReactMarkdown>
      {active && (
        <span className="ml-0.5 inline-block h-3.5 w-1 animate-pulse bg-gray-400 align-middle" />
      )}
    </div>
  );
}

import type { Components } from "react-markdown";
import DOMPurify from "dompurify";
import { marked } from "marked";

marked.use({
  gfm: true,
  breaks: false,
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * 模型常把有序列表写成「单独一行的 1. / 2.」再换行写正文，CommonMark 无法将其识别为同一条列表项。
 * 合并为「1. 正文」以便正确渲染为 ol/li。
 * 支持：编号与正文之间有多余空行、或中间仅有空白/空格行；支持半角 `.` 与全角 `．`。
 */
function mergeOrphanOrderedListMarkers(md: string): string {
  let prev = md;
  for (let i = 0; i < 8; i++) {
    const next = prev.replace(
      /(^|\n)(\d{1,3})(?:\.|．)[ \t]*(?:\r?\n[ \t]*)+(?=\S)/g,
      "$1$2. "
    );
    if (next === prev) break;
    prev = next;
  }
  return prev;
}

/** GFM 表格只识别 ASCII `|`；部分模型会输出全角竖线 U+FF5C，导致无法解析为表格。 */
function normalizeGfmPipes(md: string): string {
  return md.replace(/\uFF5C/g, "|");
}

export function preprocessAssistantMarkdown(md: string): string {
  return mergeOrphanOrderedListMarkers(normalizeGfmPipes(md));
}

const CITATION_TOKEN_RE = /【([KWF]\d{1,3})】/g;

export function injectCitationMarkdownLinks(md: string): string {
  return md.replace(CITATION_TOKEN_RE, (_m, id: string) => {
    return `[${id}](citation:${id})`;
  });
}

/** 用于复制 / 朗读 / PDF 的纯文本（弱化 Markdown 标记） */
export function markdownToPlainText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, "\n")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(CITATION_TOKEN_RE, "")
    .replace(/^#+\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Markdown → 可打印 HTML（GFM）；失败时退回原文转义展示 */
function markdownToSafePdfHtml(markdown: string): string {
  try {
    const md = preprocessAssistantMarkdown(markdown);
    const raw = marked.parse(md, { async: false }) as string;
    return DOMPurify.sanitize(raw, {
      ALLOWED_TAGS: [
        "a",
        "b",
        "blockquote",
        "br",
        "code",
        "del",
        "dd",
        "dt",
        "div",
        "em",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "hr",
        "i",
        "img",
        "input",
        "kbd",
        "li",
        "ol",
        "p",
        "pre",
        "s",
        "section",
        "strong",
        "sub",
        "sup",
        "span",
        "table",
        "thead",
        "tbody",
        "tr",
        "th",
        "td",
        "ul",
      ],
      ALLOWED_ATTR: [
        "href",
        "src",
        "alt",
        "title",
        "target",
        "rel",
        "colspan",
        "rowspan",
        "class",
        "type",
        "checked",
        "disabled",
      ],
    });
  } catch {
    return `<pre class="pdf-plain-fallback">${escapeHtml(markdown)}</pre>`;
  }
}

export function exportAssistantAsPdf(title: string, markdown: string) {
  const bodyHtml = markdownToSafePdfHtml(markdown);
  const w = window.open("", "_blank");
  if (!w) return;
  const doc = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"/><title>${escapeHtml(
    title
  )}</title><style>
    body{font-family:system-ui,"PingFang SC","Microsoft YaHei",sans-serif;padding:28px;max-width:720px;margin:0 auto;color:#111;background:#fff}
    h1{font-size:1.25rem;font-weight:600;margin:0 0 20px}
    .pdf-export{font-size:15px;line-height:1.65}
    .pdf-export h2,.pdf-export h3,.pdf-export h4{margin:1.1em 0 0.45em;font-weight:600;line-height:1.35}
    .pdf-export h2{font-size:1.2rem}.pdf-export h3{font-size:1.06rem}.pdf-export h4{font-size:1rem}
    .pdf-export p{margin:0.65em 0}
    .pdf-export ul,.pdf-export ol{padding-left:1.4rem;margin:0.65em 0}
    .pdf-export li{margin:0.25em 0}
    .pdf-export .task-list-item{list-style:none;padding-left:0.25em}
    .pdf-export .task-list-item input{vertical-align:middle;margin-right:0.35em;margin-top:-1px}
    .pdf-export blockquote{border-left:3px solid #e5e5e5;margin:0.85em 0;padding:0 0 0 1rem;color:#444}
    .pdf-export code{background:#f4f4f4;padding:0.15em 0.4em;border-radius:4px;font-size:0.92em;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace}
    .pdf-export pre{background:#f6f6f6;padding:14px;border-radius:10px;overflow:auto;border:1px solid #eaeaea;line-height:1.5;font-size:0.93em;margin:1em 0}
    .pdf-export pre code{background:none;padding:0;border:none;font-size:1em}
    .pdf-export table{border-collapse:collapse;width:100%;margin:1em 0;font-size:14px}
    .pdf-export th,.pdf-export td{border:1px solid #ddd;padding:9px 10px;text-align:left;vertical-align:top}
    .pdf-export th{background:#f5f5f5;font-weight:600}
    .pdf-export thead th{background:#eaeaea;border-color:#ccc}
    .pdf-export a{color:#c2410c}
    .pdf-export hr{border:none;border-top:1px solid #e5e5e5;margin:1.35em 0}
    .pdf-plain-fallback{white-space:pre-wrap;word-break:break-word;font-family:inherit;margin:0}
    @media print{body{padding:14px}}
  </style></head><body>
  <h1>${escapeHtml(title)}</h1>
  <div class="pdf-export">${bodyHtml}</div>
  <script>window.onload=function(){window.print();}</script>
  </body></html>`;
  w.document.write(doc);
  w.document.close();
}

/** 助手正文已用 remark-gfm 解析为 table 元素；需显式边框与横向滚动，否则会像「挤成一行的纯文本」。 */
export const assistantMarkdownComponents: Components = {
  table: ({ node, children, ...props }) => {
    void node;
    return (
      <div className="no-scrollbar my-3 w-full max-w-full overflow-x-auto rounded-xl border border-[#e6ded2] bg-white/70 shadow-[0_1px_2px_rgba(28,25,23,0.04)]">
        <table
          className="w-full min-w-[min(100%,520px)] border-collapse text-[0.92rem] leading-snug"
          {...props}
        >
          {children}
        </table>
      </div>
    );
  },
  thead: ({ node, children, ...props }) => {
    void node;
    return <thead {...props}>{children}</thead>;
  },
  th: ({ node, children, ...props }) => {
    void node;
    return (
      <th
        className="border border-[#e6ded2] bg-[#f7f2ea] px-3 py-2 text-left font-semibold text-[#2b2721]"
        {...props}
      >
        {children}
      </th>
    );
  },
  td: ({ node, children, ...props }) => {
    void node;
    return (
      <td
        className="border border-[#e6ded2] px-3 py-2 align-top text-[#2f2a23]"
        {...props}
      >
        {children}
      </td>
    );
  },
};

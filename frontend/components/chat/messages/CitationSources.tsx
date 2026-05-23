/**
 * @fileoverview 助手气泡内引用角标、来源 HoverCard 与侧栏来源面板。
 *
 * 角标由 ``AssistantBubble`` 将 ``【K1】`` 预处理为 ``citation:`` 链接后在此渲染；
 * 仅展示工具真实登记的来源（与后端 citation 登记一致）。
 */
"use client";

import { useMemo, useState } from "react";
import * as HoverCard from "@radix-ui/react-hover-card";
import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, FileText, Globe2, Library, X } from "lucide-react";
import type { CitationSource } from "@/types/chat";

const KIND_LABEL: Record<CitationSource["kind"], string> = {
  knowledge: "知识库",
  web: "网络资源",
  formula: "方剂/文献",
  external: "外部来源",
};

const KIND_ICON: Record<CitationSource["kind"], typeof Library> = {
  knowledge: Library,
  web: Globe2,
  formula: FileText,
  external: FileText,
};

/** 从 URL 提取去 www 的主机名，用于来源卡片副标题。 */
function sourceDomain(url?: string): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** 截断 snippet 至约 180 字符，HoverCard 内紧凑展示。 */
function shortSnippet(text?: string): string {
  const s = (text || "").replace(/\s+/g, " ").trim();
  return s.length > 180 ? `${s.slice(0, 179)}…` : s;
}

/** 单条引用来源详情卡（角标 Hover 与侧栏列表复用）。 */
function SourceCard({ source, dense = false }: { source: CitationSource; dense?: boolean }) {
  const Icon = KIND_ICON[source.kind] ?? FileText;
  const domain = sourceDomain(source.url);
  const score =
    typeof source.score === "number" && Number.isFinite(source.score)
      ? source.score.toFixed(4)
      : null;

  return (
    <div className="rounded-xl border border-[#eadfce] bg-white/95 p-3 shadow-sm">
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f7f0e6] text-[#9a5b1f]">
          <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[11px] text-stone-500">
            <span className="rounded-full bg-stone-100 px-1.5 py-0.5 font-mono text-[10px] text-stone-600">
              {source.id}
            </span>
            <span>{KIND_LABEL[source.kind]}</span>
            {score ? <span className="font-mono">score {score}</span> : null}
          </div>
          <div className="mt-1 line-clamp-2 text-sm font-medium leading-snug text-stone-900">
            {source.title}
          </div>
          <div className="mt-0.5 truncate text-xs text-stone-500">
            {domain || source.source || "本地资料"}
          </div>
        </div>
        {source.url ? (
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="mt-0.5 rounded-md p-1 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700"
            aria-label="打开来源"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : null}
      </div>
      {source.snippet && !dense ? (
        <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-xs leading-relaxed text-stone-600">
          {shortSnippet(source.snippet)}
        </p>
      ) : null}
    </div>
  );
}

/** 正文内联引用角标：Hover 预览，点击打开侧栏来源面板。 */
export function CitationMarker({
  id,
  source,
  onOpenPanel,
}: {
  id: string;
  source?: CitationSource;
  onOpenPanel: () => void;
}) {
  // 模型引用了未登记或已过滤的 id 时仍显示灰色占位，避免正文缺角标。
  if (!source) {
    return (
      <span className="mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-stone-200 px-1 align-super text-[10px] font-medium leading-none text-stone-400">
        {id.replace(/^[A-Z]/, "")}
      </span>
    );
  }

  return (
    <HoverCard.Root openDelay={120} closeDelay={80}>
      <HoverCard.Trigger asChild>
        <button
          type="button"
          onClick={onOpenPanel}
          className="mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-orange-200 bg-orange-50 px-1 align-super text-[10px] font-semibold leading-none text-orange-700 transition-colors hover:border-orange-300 hover:bg-orange-100"
          aria-label={`查看引用来源 ${source.id}`}
        >
          {source.id.replace(/^[A-Z]/, "")}
        </button>
      </HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content
          side="top"
          align="center"
          sideOffset={8}
          collisionPadding={16}
          className="z-[10060] w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-stone-200 bg-white p-2 shadow-xl"
        >
          <SourceCard source={source} />
          <HoverCard.Arrow className="fill-white" />
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}

/** 右侧滑出面板：按 kind 分组展示本轮全部引用来源。 */
export function CitationSourcePanel({
  sources,
  open,
  onClose,
}: {
  sources: CitationSource[];
  open: boolean;
  onClose: () => void;
}) {
  const grouped = useMemo(() => {
    const order: CitationSource["kind"][] = ["knowledge", "web", "formula", "external"];
    return order
      .map((kind) => ({ kind, items: sources.filter((s) => s.kind === kind) }))
      .filter((g) => g.items.length > 0);
  }, [sources]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[10040]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/20"
            aria-label="关闭引用来源"
            onClick={onClose}
          />
          <motion.aside
            className="absolute right-0 top-0 flex h-full w-full max-w-[420px] flex-col border-l border-stone-200 bg-[#fdfbf7] shadow-2xl"
            initial={{ x: 36, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 36, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 30 }}
          >
            <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-stone-900">
                  引用来源 ({sources.length})
                </h2>
                <p className="mt-0.5 text-xs text-stone-500">
                  仅展示本轮工具真实返回的来源
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
              {grouped.map((group) => (
                <section key={group.kind}>
                  <div className="mb-2 text-xs font-medium text-stone-500">
                    {KIND_LABEL[group.kind]} · {group.items.length}
                  </div>
                  <div className="space-y-2.5">
                    {group.items.map((source) => (
                      <SourceCard key={source.id} source={source} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </motion.aside>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/** 工具栏「引用来源 (N)」入口；流式生成中由父级通过 showCitationSources 控制隐藏。 */
export function CitationSourcesButton({
  count,
  onClick,
}: {
  count: number;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="ml-1 inline-flex shrink-0 items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2 py-1 text-xs font-medium text-orange-700 transition-colors hover:border-orange-300 hover:bg-orange-100"
    >
      <Library className="h-3.5 w-3.5" />
      引用来源 ({count})
      <span className="sr-only">{hovered ? "，点击查看详情" : ""}</span>
    </button>
  );
}

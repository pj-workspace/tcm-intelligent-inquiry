/**
 * @fileoverview 输入框上方 token 用量提示（本轮 SSE 或本会话累计）。
 */
"use client";

export type RoundTokensUsage = {
  prompt: number;
  completion: number;
  total: number;
};

/** 输入框上方 tokens：本轮（SSE）或本会话累计（库同步），弱视觉层级 */
export function RoundTokensHint({
  usage,
  variant = "round",
}: {
  usage: RoundTokensUsage | null;
  variant?: "round" | "conversation";
}) {
  const show = usage != null && usage.total > 0;
  const title =
    show && usage
      ? `Prompt ${usage.prompt.toLocaleString("zh-CN")} + Completion ${usage.completion.toLocaleString("zh-CN")}`
      : undefined;
  const prefix = variant === "conversation" ? "本会话" : "本轮";

  return (
    <div
      className="flex min-h-[22px] shrink-0 items-center px-4 pt-2"
      aria-live="polite"
      aria-label={show ? `${prefix}累计约 ${usage!.total} tokens` : undefined}
    >
      {show ? (
        <span
          title={title}
          className="max-w-full truncate text-xs tabular-nums text-gray-400"
        >
          {prefix} · 约 {usage!.total.toLocaleString("zh-CN")} tokens
        </span>
      ) : null}
    </div>
  );
}

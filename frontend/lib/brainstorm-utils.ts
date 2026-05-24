import { isMcpToolName, toolDisplayName } from "@/lib/tool-labels";
import type {
  BrainstormStep,
  EdgeFadeState,
  WebResultItem,
} from "@/types/brainstorm";

/**
 * @fileoverview 头脑风暴 trace UI 工具：时长格式化、工具标签、trace 标题与结果解析。
 */

/** 新 step 到达时，距 trace 内部底部 <= 该值则视为"仍在底部，可以跟随"。
 *  之前的 72 太宽松——用户只上滑一点就会被新 step 拽回。压到 12 给一手势就能脱离跟随。 */
export const INTERNAL_SCROLL_THRESHOLD = 12;
/** onScroll 时距底部 <= 该值才视为"用户主动滚回底部" —— 实际未启用回弹（去掉了 rebound），
 *  仅作向后兼容保留导出。 */
export const INTERNAL_LOCK_THRESHOLD = 8;

/** 将秒数格式化为 UI 展示字符串（<10s 保留一位小数）。 */
export function formatDurationSec(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0s";
  if (sec < 10) return `${Math.round(sec * 10) / 10}s`;
  return `${Math.round(sec)}s`;
}

/** 根据 scrollTop 与 scrollHeight 计算上下边缘是否应显示渐变遮罩。 */
export function getEdgeFadeState(el: HTMLDivElement | null): EdgeFadeState {
  if (!el) return { top: false, bottom: false };
  const maxScrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
  if (maxScrollTop <= 2) return { top: false, bottom: false };
  return {
    top: el.scrollTop > 6,
    bottom: el.scrollTop < maxScrollTop - 6,
  };
}

/** 工具步骤标题：内置中文名或 MCP 远端名。 */
export function toolActionLabel(
  toolName: string,
  mcpRemoteName?: string | null
): string {
  return toolDisplayName(toolName, mcpRemoteName);
}

/** 工具成功终态的摘要文案（按工具类型解析结果数量）。 */
export function toolSuccessLabel(
  toolName: string,
  outputPreview?: string,
  webResults?: WebResultItem[],
  summaries?: string[],
  mcpRemoteName?: string | null
): string {
  if (toolName === "searx_web_search") {
    const n = webResults?.length ?? parseWebResults(outputPreview).length;
    return n > 0 ? `找到了 ${n} 篇相关资料` : "联网搜索完成";
  }
  if (toolName === "formula_lookup") {
    const n = summaries?.length ?? parseSummaryBlocks(outputPreview).length;
    return `找到了 ${n > 0 ? n : 1} 个方剂`;
  }
  if (toolName === "search_tcm_knowledge") {
    return "知识库检索成功";
  }
  const name = toolDisplayName(toolName, mcpRemoteName);
  if (isMcpToolName(toolName) || mcpRemoteName) {
    return `${name} 完成`;
  }
  return `${name} 完成`;
}

/** 工具运行中的进度文案。 */
export function runningToolLabel(
  toolName: string,
  mcpRemoteName?: string | null
): string {
  const name = toolDisplayName(toolName, mcpRemoteName);
  if (isMcpToolName(toolName) || mcpRemoteName) {
    return `正在调用 ${name}...`;
  }
  if (name.startsWith("正在")) return `${name}...`;
  return `正在${name}...`;
}

/** 工具业务失败终态文案。 */
export function toolFailureLabel(
  toolName: string,
  mcpRemoteName?: string | null
): string {
  const name = toolDisplayName(toolName, mcpRemoteName);
  return `${name} 失败(>﹏<)`;
}

/** 主动终止 / 超时兜底导致的终态：与「失败」区分（不引导重试，仅告知中断） */
export function toolAbortedLabel(
  toolName: string,
  mcpRemoteName?: string | null
): string {
  const name = toolDisplayName(toolName, mcpRemoteName);
  return `${name} 已终止`;
}

/** 用户终止后 trace 内工具行的中性文案（「输出已被终止」仅在 assistant 气泡展示）。 */
export function toolInvokedLabel(
  toolName: string,
  mcpRemoteName?: string | null,
): string {
  const name = toolDisplayName(toolName, mcpRemoteName);
  return `调用了 ${name}`;
}

/** trace 头部：流式中实时反映当前活跃 step 的语义 */
export function streamingTraceHeadline(steps: BrainstormStep[]): string {
  const lastUserInput = [...steps]
    .reverse()
    .find((s): s is Extract<BrainstormStep, { type: "user_input" }> => s.type === "user_input");
  if (lastUserInput?.status === "preparing") {
    return "准备询问用户...";
  }
  if (lastUserInput?.status === "waiting") {
    return "等待用户补充...";
  }
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    if (step.type === "tool" && step.status === "running") {
      return runningToolLabel(step.toolName, step.mcpRemoteName);
    }
  }
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    if (step.type === "thinking" && step.durationSec == null) {
      return "思考中...";
    }
  }
  return "处理中...";
}

/** trace 头部：流结束后按内容自动汇总（Claude 风格） */
export function summarizeTraceHeadline(
  steps: BrainstormStep[],
  durationSec?: number,
): string {
  const tools = steps.filter(
    (s): s is Extract<BrainstormStep, { type: "tool" }> => s.type === "tool",
  );
  const thinkings = steps.filter((s) => s.type === "thinking");
  const userInputs = steps.filter((s) => s.type === "user_input");
  const dur =
    durationSec != null ? ` · ${formatDurationSec(durationSec)}` : "";

  if (steps.length === 0) return `完成${dur}`;

  if (tools.length === 0) {
    if (userInputs.length > 0) return `用户补充了信息${dur}`;
    if (thinkings.length > 0) return `思考过程${dur}`;
    return `完成${dur}`;
  }

  if (tools.length === 1) {
    const t = tools[0];
    const name = toolDisplayName(t.toolName, t.mcpRemoteName);
    return `调用了 ${name}${dur}`;
  }

  const distinctNames = new Set(
    tools.map((t) => toolDisplayName(t.toolName, t.mcpRemoteName)),
  );
  if (distinctNames.size === 1) {
    return `调用了 ${[...distinctNames][0]} ${tools.length} 次${dur}`;
  }
  return `用了 ${tools.length} 个工具${dur}`;
}

/** 从 searx_web_search 的 outputPreview 解析结构化网页结果列表。 */
export function parseWebResults(raw?: string): WebResultItem[] {
  if (!raw) return [];
  return raw
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
      const titleLine = lines[0] ?? "";
      const title = titleLine
        .replace(/^\[\d+\](\s*\[[^\]]*\])?\s*/, "")
        .trim();
      const urlIdx = lines.findIndex((line) => /^https?:\/\//i.test(line));
      return {
        title: title || "(无标题)",
        url: urlIdx >= 0 ? lines[urlIdx] : undefined,
        summary:
          urlIdx >= 0
            ? lines.slice(urlIdx + 1).join(" ")
            : lines.slice(1).join(" "),
      };
    })
    .filter((item) => item.title || item.url)
    .slice(0, 10);
}

/** 从 formula_lookup 等工具的 outputPreview 解析摘要块列表。 */
export function parseSummaryBlocks(raw?: string): string[] {
  if (!raw) return [];
  const blocks = raw.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  const source = blocks.length > 0 ? blocks : [raw.trim()];
  return source.slice(0, 5).map((block) => {
    const cleaned = block
      .replace(/^\[\d+\]\s*/, "")
      .replace(/^（[^）]+）\s*/, "")
      .replace(/\s+/g, " ")
      .trim();
    return cleaned.length > 150 ? `${cleaned.slice(0, 149)}…` : cleaned;
  });
}

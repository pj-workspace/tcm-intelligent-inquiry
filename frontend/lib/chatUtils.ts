import type {
  ApiMessageRow,
  ChatMessage,
  FlatMessage,
  Message,
  TraceMessage,
  ToolStep,
  WidgetMessage,
} from "@/types/chat";
import type { BrainstormStep } from "@/types/brainstorm";
import { toolActionLabel } from "@/lib/brainstorm-utils";

/** 将 SSE / 历史记录中的工具入参转为可展示字符串 */
export function toolIoToPreview(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

export function sumThinkingDurations(steps: BrainstormStep[]): number | undefined {
  const total = steps.reduce((sum, step) => {
    if (step.type !== "thinking") return sum;
    return sum + (step.durationSec ?? 0);
  }, 0);
  return total > 0 ? total : undefined;
}

/** 解析 ISO 时间字符串为毫秒；失败返回 null */
function parseIsoMs(iso?: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/** 用 step 数组首末 createdAt 计算 trace 总时长（秒）；失败时回退 sumThinkingDurations。 */
function computeTraceDuration(
  steps: BrainstormStep[],
  endIsoCandidate?: string,
): number | undefined {
  let firstMs: number | null = null;
  let lastMs: number | null = null;
  for (const s of steps) {
    const t = parseIsoMs(s.createdAt);
    if (t == null) continue;
    if (firstMs == null) firstMs = t;
    lastMs = t;
  }
  const endMs = parseIsoMs(endIsoCandidate);
  if (endMs != null && (lastMs == null || endMs > lastMs)) lastMs = endMs;
  if (firstMs != null && lastMs != null && lastMs >= firstMs) {
    const sec = (lastMs - firstMs) / 1000;
    if (sec > 0) return sec;
  }
  return sumThinkingDurations(steps);
}

/**
 * 历史聚合（杂乱多 trace 多 bubble 样式）：
 *   - 连续的 thinking / tool 项合并为一个 trace
 *   - 遇到 assistant 时 flush trace（collapsed=false 保持展开，与流式结束行为一致）
 *   - 遇到 user / widget 时 flush trace
 * trace.totalDurationSec 用 step 首末 createdAt 计算（流式时已经在 finalizeTrace 里算过）。
 *
 * @param options.showTrace 默认 true；传 false 时彻底丢弃 thinking/tool 数据（保留向后兼容）
 */
export function groupMessagesIntoTraces(
  items: FlatMessage[],
  options: { showTrace?: boolean } = {},
): Message[] {
  const showTrace = options.showTrace !== false;
  if (!showTrace) {
    return items
      .filter(
        (m): m is Exclude<FlatMessage, { type: "thinking" } | { type: "tool" }> =>
          m.type === "message" || m.type === "widget",
      )
      .map((m) => m as Message);
  }
  const grouped: Message[] = [];
  let pendingSteps: BrainstormStep[] = [];

  const flushTrace = (collapsed: boolean, endIsoCandidate?: string) => {
    if (!pendingSteps.length) return;
    grouped.push({
      id: `trace-${pendingSteps[0].id}`,
      type: "trace",
      steps: pendingSteps,
      status: "done",
      totalDurationSec: computeTraceDuration(pendingSteps, endIsoCandidate),
      collapsed,
    } satisfies TraceMessage);
    pendingSteps = [];
  };

  for (const item of items) {
    if (item.type === "message") {
      // assistant / user 都终止当前 trace；assistant 后保持 trace 展开（与流式 sealCurrentTrace 一致）
      const endIso = item.createdAt;
      flushTrace(false, endIso);
      grouped.push(item);
      continue;
    }
    if (item.type === "widget") {
      flushTrace(false);
      grouped.push(item);
      continue;
    }
    if (item.type === "thinking" || item.type === "tool") {
      pendingSteps.push(item);
    }
  }

  // 末尾残留：保持展开（折叠由用户手动操作）
  flushTrace(false);

  // 历史加载：根据 widget 后紧跟的第一条用户消息推断答案状态，并将该用户消息从列表中移除
  // （widget 紧凑状态已展示答案，无需再显示用户气泡，与实时流体验保持一致）
  const widgetAnswerIndices = new Set<number>();
  for (let i = 0; i < grouped.length; i++) {
    const cur = grouped[i];
    if (cur.type !== "widget" || cur.answer !== undefined || cur.dismissed) continue;
    let found = false;
    for (let j = i + 1; j < grouped.length; j++) {
      const next = grouped[j];
      if (next.type === "trace") continue;
      if (next.type === "message" && next.role === "user") {
        grouped[i] = { ...cur, answer: next.content };
        widgetAnswerIndices.add(j);
        found = true;
      }
      break;
    }
    if (!found) {
      grouped[i] = { ...cur, dismissed: true };
    }
  }

  return grouped.filter((_, idx) => !widgetAnswerIndices.has(idx));
}

/** 仅从「最后一条」助手气泡取追问（与仅最新消息展示追问的 UI 一致）；无则返回 null */
export function lastAssistantFollowUpFromMessages(
  msgs: Message[],
): { messageId: string; items: string[] } | null {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.type !== "message" || m.role !== "assistant") continue;
    const rows = (m as ChatMessage).followUpSuggestions;
    if (
      Array.isArray(rows) &&
      rows.length > 0 &&
      rows.every((x): x is string => typeof x === "string")
    ) {
      return { messageId: m.id, items: rows };
    }
    return null;
  }
  return null;
}

/** 服务端用户消息：纯文案或含图 JSON v1（与后端 app.chat.services.streaming._persist_user_turn_content 对齐） */
export function parseUserMessageContent(raw: string): {
  displayText: string;
  imageUrls?: string[];
} {
  const original = raw ?? "";
  const s = original.trim();
  if (!s.startsWith("{")) return { displayText: original };
  try {
    const j = JSON.parse(s) as {
      v?: number;
      text?: unknown;
      images?: unknown;
    };
    if (j?.v !== 1 || !Array.isArray(j.images)) return { displayText: original };
    const urls = j.images.filter(
      (x): x is string => typeof x === "string" && x.trim().length > 0
    );
    const textPart = typeof j.text === "string" ? j.text : "";
    if (urls.length === 0) return { displayText: textPart.trim() ? textPart : original };
    return {
      displayText: textPart.trim() ? textPart : "（附图）",
      imageUrls: urls,
    };
  } catch {
    return { displayText: original };
  }
}

export function mapApiRowToMessage(msg: ApiMessageRow): FlatMessage {
  const createdAt =
    typeof msg.created_at === "string" && msg.created_at
      ? msg.created_at
      : undefined;
  if (msg.role === "thinking") {
    return {
      id: msg.id,
      type: "thinking",
      content: msg.content,
      durationSec:
        msg.duration_sec != null && msg.duration_sec >= 0
          ? msg.duration_sec
          : undefined,
      createdAt,
    };
  }
  if (msg.role === "tool") {
    try {
      const payload = JSON.parse(msg.content) as {
        name?: string;
        mcpRemoteName?: string;
        runId?: string;
        status?: string;
        aborted?: boolean;
        outputPreview?: string;
        input?: unknown;
      };
      return {
        id: msg.id,
        type: "tool",
        toolName:
          typeof payload.name === "string" && payload.name ? payload.name : "tool",
        mcpRemoteName:
          typeof payload.mcpRemoteName === "string" && payload.mcpRemoteName
            ? payload.mcpRemoteName
            : undefined,
        status: payload.status === "error" ? "error" : "success",
        ...(payload.aborted === true ? { aborted: true } : {}),
        runId: typeof payload.runId === "string" ? payload.runId : undefined,
        inputPreview: toolIoToPreview(payload.input),
        outputPreview:
          typeof payload.outputPreview === "string" && payload.outputPreview
            ? payload.outputPreview
            : undefined,
        createdAt,
      } satisfies ToolStep;
    } catch {
      return {
        id: msg.id,
        type: "tool",
        toolName: "tool",
        status: "success",
        createdAt,
      } satisfies ToolStep;
    }
  }
  if (msg.role === "widget") {
    try {
      const payload = JSON.parse(msg.content) as {
        widgetType?: string;
        question?: string;
        choices?: string[];
        allowFreeText?: boolean;
      };
      return {
        id: msg.id,
        type: "widget",
        widgetType: "choice",
        question: typeof payload.question === "string" ? payload.question : "",
        choices: Array.isArray(payload.choices) ? payload.choices.map(String) : [],
        allowFreeText: payload.allowFreeText !== false,
      } satisfies WidgetMessage;
    } catch {
      return {
        id: msg.id,
        type: "widget",
        widgetType: "choice",
        question: "",
        choices: [],
        allowFreeText: true,
      } satisfies WidgetMessage;
    }
  }
  if (msg.role === "user") {
    const { displayText, imageUrls } = parseUserMessageContent(msg.content);
    return {
      id: msg.id,
      role: "user",
      type: "message",
      content: displayText,
      ...(imageUrls?.length ? { imageUrls } : {}),
      ...(createdAt ? { createdAt } : {}),
    };
  }

  return {
    id: msg.id,
    role: "assistant",
    type: "message",
    content: msg.content,
    modelName:
      typeof msg.model_name === "string" && msg.model_name ? msg.model_name : undefined,
    ...(() => {
      const fus = msg.follow_up_suggestions;
      if (!Array.isArray(fus) || fus.length === 0) return {};
      const items = fus.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
      return items.length > 0 ? { followUpSuggestions: items } : {};
    })(),
    ...(createdAt ? { createdAt } : {}),
  };
}

/* ── 会话导出（Markdown）────────────────────────────────────────────────── */

function traceStepsToMarkdown(steps: BrainstormStep[]): string {
  const lines: string[] = ["## 过程"];
  for (const step of steps) {
    if (step.type === "thinking") {
      const d =
        step.durationSec != null && Number.isFinite(step.durationSec)
          ? `${
              step.durationSec < 10
                ? Math.round(step.durationSec * 10) / 10
                : Math.round(step.durationSec)
            }s`
          : null;
      lines.push("", `### 思考${d != null ? `（${d}）` : ""}`, "", step.content);
      continue;
    }
    const st =
      step.status === "running"
        ? "进行中"
        : step.status === "error"
          ? "失败"
          : "完成";
    lines.push(
      "",
      `### 工具 · ${toolActionLabel(step.toolName, step.mcpRemoteName)}`,
      "",
      `- **状态**：${st}`,
    );
    if (step.inputPreview?.trim())
      lines.push("", "**参数**", "", "```", step.inputPreview.trim(), "```");
    if (step.outputPreview?.trim())
      lines.push("", "**结果摘要**", "", step.outputPreview.trim());
  }
  return lines.join("\n");
}

/** 文件名用：去掉路径非法字符并截断长度 */
export function sanitizeDownloadBasename(raw: string, fallback = "会话记录"): string {
  const collapsed = raw.replace(/\s+/g, " ").trim();
  const base =
    collapsed.length > 0
      ? collapsed.replace(/[/\\?%*:|"<>[\x00-\x1f\r\n]/g, "_").replace(/_+/g, "_").trim()
      : fallback;
  const clipped = base.substring(0, 120).replace(/^\.+|\.+$/g, "") || fallback;
  return clipped;
}

/**
 * 会话导出为 Markdown：保留 Markdown 原文，头脑风暴/trace 导出为可读小节。
 */
export function conversationToMarkdown(title: string, messages: Message[]): string {
  const heading = sanitizeDownloadBasename(title);
  const blocks: string[] = [`# ${heading}`];
  for (const msg of messages) {
    if (msg.type === "message") {
      const who = msg.role === "user" ? "用户" : "TCM AI";
      let block = `## ${who}\n\n${msg.content ?? ""}`;
      if (msg.role === "user" && msg.imageUrls?.length) {
        block +=
          "\n\n" +
          msg.imageUrls.map((u) => `- 图片：<${u}>`).join("\n");
      }
      if (msg.role === "assistant") {
        const extras: string[] = [];
        if (msg.modelName?.trim())
          extras.push(`_模型：${msg.modelName.trim()}_`);
        if (msg.interrupted)
          extras.push("_（本条输出曾被终止）_");
        if (extras.length) block += `\n\n${extras.join("\n\n")}`;
      }
      blocks.push(block);
    } else if (msg.type === "trace") {
      blocks.push(traceStepsToMarkdown(msg.steps));
    }
  }
  return `${blocks.filter((b) => b.trim()).join("\n\n---\n\n")}\n`;
}

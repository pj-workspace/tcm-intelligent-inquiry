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

export function groupMessagesIntoTraces(items: FlatMessage[]): Message[] {
  const grouped: Message[] = [];
  let pendingSteps: BrainstormStep[] = [];

  const flushPendingSteps = (collapsed: boolean) => {
    if (!pendingSteps.length) return;
    grouped.push({
      id: `trace-${pendingSteps[0].id}`,
      type: "trace",
      steps: pendingSteps,
      status: "done",
      totalDurationSec: sumThinkingDurations(pendingSteps),
      collapsed,
    } satisfies TraceMessage);
    pendingSteps = [];
  };

  for (const item of items) {
    if (item.type === "message") {
      if (pendingSteps.length > 0) {
        flushPendingSteps(item.role === "assistant");
      }
      grouped.push(item);
      continue;
    }
    if (item.type === "widget") {
      if (pendingSteps.length > 0) {
        flushPendingSteps(true);
      }
      grouped.push(item);
      continue;
    }
    pendingSteps.push(item);
  }

  flushPendingSteps(true);

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
  if (msg.role === "thinking") {
    return {
      id: msg.id,
      type: "thinking",
      content: msg.content,
      durationSec:
        msg.duration_sec != null && msg.duration_sec >= 0
          ? msg.duration_sec
          : undefined,
    };
  }
  if (msg.role === "tool") {
    try {
      const payload = JSON.parse(msg.content) as {
        name?: string;
        mcpRemoteName?: string;
        runId?: string;
        status?: string;
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
        runId: typeof payload.runId === "string" ? payload.runId : undefined,
        inputPreview: toolIoToPreview(payload.input),
        outputPreview:
          typeof payload.outputPreview === "string" && payload.outputPreview
            ? payload.outputPreview
            : undefined,
      } satisfies ToolStep;
    } catch {
      return {
        id: msg.id,
        type: "tool",
        toolName: "tool",
        status: "success",
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
  };
}

/* ── 会话导出（Markdown）────────────────────────────────────────────────── */

function traceStepsToMarkdown(steps: BrainstormStep[]): string {
  const lines: string[] = ["## 头脑风暴"];
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
    } else {
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
        `- **状态**：${st}`
      );
      if (step.inputPreview?.trim())
        lines.push("", "**参数**", "", "```", step.inputPreview.trim(), "```");
      if (step.outputPreview?.trim())
        lines.push("", "**结果摘要**", "", step.outputPreview.trim());
    }
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

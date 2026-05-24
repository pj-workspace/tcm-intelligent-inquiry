/**
 * @fileoverview 聊天消息工具函数：历史行映射、trace 聚合、引用来源规范化、会话导出。
 */

import type {
  ApiMessageRow,
  ChatMessage,
  CitationKind,
  CitationSource,
  FlatMessage,
  FormFieldDef,
  Message,
  TraceMessage,
  ToolStep,
  WidgetMessage,
} from "@/types/chat";
import type { BrainstormStep } from "@/types/brainstorm";
import { toolActionLabel } from "@/lib/brainstorm-utils";

/** widget 到达时合并 trace 内 user_input：preparing → waiting，无 preparing 则追加。 */
export function mergeWidgetUserInputStep(
  steps: BrainstormStep[],
  widgetId: string,
  patch: {
    question: string;
    choices?: string[];
    allowFreeText?: boolean;
    fields?: FormFieldDef[];
    widgetKind?: "choice" | "form";
  },
): BrainstormStep[] {
  let replaced = false;
  const mapped = steps.map((step) => {
    if (replaced || step.type !== "user_input" || step.status !== "preparing") {
      return step;
    }
    replaced = true;
    return {
      ...step,
      widgetId,
      question: patch.question,
      ...(patch.choices ? { choices: patch.choices } : {}),
      ...(patch.allowFreeText !== undefined
        ? { allowFreeText: patch.allowFreeText }
        : {}),
      ...(patch.fields
        ? { fields: patch.fields, widgetKind: patch.widgetKind ?? ("form" as const) }
        : {}),
      status: "waiting" as const,
    };
  });
  if (replaced) return mapped;
  return [
    ...mapped,
    {
      id: `user-input-${widgetId}`,
      type: "user_input",
      widgetId,
      question: patch.question,
      ...(patch.choices
        ? {
            choices: patch.choices,
            allowFreeText: patch.allowFreeText ?? true,
            widgetKind: "choice" as const,
          }
        : {}),
      ...(patch.fields
        ? { fields: patch.fields, widgetKind: patch.widgetKind ?? ("form" as const) }
        : {}),
      status: "waiting" as const,
    },
  ];
}

/** 用户作答/跳过时更新 trace 内 user_input；widgetId 不匹配时回退到最后一条 preparing/waiting。 */
export function resolveUserInputStepOnAnswer(
  steps: BrainstormStep[],
  widgetId: string,
  answer: string | null,
  dismissed: boolean,
): BrainstormStep[] {
  let matched = false;
  const mapped = steps.map((step) => {
    if (step.type === "user_input" && step.widgetId === widgetId) {
      matched = true;
      return {
        ...step,
        status: dismissed ? ("dismissed" as const) : ("answered" as const),
        answer: answer ?? undefined,
      };
    }
    return step;
  });
  if (matched) return mapped;
  for (let i = mapped.length - 1; i >= 0; i--) {
    const step = mapped[i];
    if (
      step.type === "user_input" &&
      (step.status === "preparing" || step.status === "waiting")
    ) {
      return mapped.map((s, idx) =>
        idx === i
          ? {
              ...step,
              widgetId,
              status: dismissed ? ("dismissed" as const) : ("answered" as const),
              answer: answer ?? undefined,
            }
          : s,
      );
    }
  }
  return mapped;
}

/** ask_user 失败等场景：移除尚未就绪的 preparing 占位步骤。 */
export function clearPreparingUserInputSteps(
  steps: BrainstormStep[],
): BrainstormStep[] {
  return steps.filter(
    (step) => !(step.type === "user_input" && step.status === "preparing"),
  );
}

/** widget 已展示：收口仍在 running 的 ask_user / ask_user_form 工具步骤。 */
export function finalizeRunningAskUserTools(
  steps: BrainstormStep[],
): BrainstormStep[] {
  return steps.map((step) => {
    if (
      step.type === "tool" &&
      step.status === "running" &&
      (step.toolName === "ask_user" || step.toolName === "ask_user_form")
    ) {
      return {
        ...step,
        status: "success" as const,
        outputPreview: step.outputPreview ?? "[已展示交互]",
      };
    }
    return step;
  });
}

/** 同工具再次调用前，将上一轮同名的 running 步骤标为 error（模型重试场景）。 */
export function supersedeRunningToolSteps(
  steps: BrainstormStep[],
  toolName: string,
): BrainstormStep[] {
  if (!toolName) return steps;
  return steps.map((step) => {
    if (
      step.type === "tool" &&
      step.status === "running" &&
      step.toolName === toolName
    ) {
      return {
        ...step,
        status: "error" as const,
        outputPreview: step.outputPreview ?? "已重试",
      };
    }
    return step;
  });
}

/** 定位应接收 tool-result 的 running 工具步骤。 */
export function findRunningToolStepIndex(
  steps: BrainstormStep[],
  runId: string | undefined,
  toolName: string,
): number {
  if (runId) {
    const byRun = steps.findIndex(
      (s) => s.type === "tool" && s.status === "running" && s.runId === runId,
    );
    if (byRun >= 0) return byRun;
  }
  if (toolName) {
    for (let i = steps.length - 1; i >= 0; i--) {
      const s = steps[i];
      if (s.type === "tool" && s.status === "running" && s.toolName === toolName) {
        return i;
      }
    }
  }
  return steps.findIndex((s) => s.type === "tool" && s.status === "running");
}

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

const CITATION_KINDS = new Set<CitationKind>([
  "knowledge",
  "web",
  "formula",
  "external",
]);

/**
 * 将 SSE/DB 中的 sources 数组规范为 ``CitationSource[]``。
 * 丢弃缺少 id/title/kind 或 kind 非法的项，避免脏数据渲染为角标。
 */
export function normalizeCitationSources(v: unknown): CitationSource[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: CitationSource[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const id = typeof item.id === "string" ? item.id.trim() : "";
    const kind = typeof item.kind === "string" ? item.kind : "";
    const title = typeof item.title === "string" ? item.title.trim() : "";
    if (!id || !title || !CITATION_KINDS.has(kind as CitationKind)) continue;
    const source: CitationSource = {
      id,
      kind: kind as CitationKind,
      title,
    };
    if (typeof item.source === "string" && item.source.trim()) source.source = item.source;
    if (typeof item.url === "string" && item.url.trim()) source.url = item.url;
    if (typeof item.snippet === "string" && item.snippet.trim()) source.snippet = item.snippet;
    if (typeof item.score === "number" && Number.isFinite(item.score)) {
      source.score = item.score;
    }
    if (item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)) {
      source.metadata = item.metadata as Record<string, unknown>;
    }
    out.push(source);
  }
  return out.length ? out : undefined;
}

/** 累加 thinking 步骤的 durationSec 总和；无有效时长时返回 undefined。 */
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
        (m): m is Exclude<
          FlatMessage,
          | { type: "thinking" }
          | { type: "tool" }
          | { type: "summary-mark" }
          | { type: "interrupt-mark" }
        > => m.type === "message" || m.type === "widget",
      )
      .map((m) => m as Message);
  }
  const grouped: Message[] = [];
  let pendingSteps: BrainstormStep[] = [];
  /** 当前积累 step 期间是否遇到过 summary-mark：flush 时把 trace 打 summaryAcknowledged。 */
  let pendingSummaryAcknowledged = false;
  /** 本轮已遇到 interrupt-mark：flush 时 trace 打 aborted，且不在此处提前 flush 撕开 trace。 */
  let pendingRoundInterrupted = false;
  /** interrupt-mark 时本轮尚无 assistant，占位气泡 id 推迟到 trace flush 之后再 append。 */
  let pendingInterruptedPlaceholderId: string | null = null;

  const flushTrace = (collapsed: boolean, endIsoCandidate?: string) => {
    if (!pendingSteps.length) return;
    const hasAbortedTool = pendingSteps.some(
      (s) => s.type === "tool" && s.aborted === true,
    );
    grouped.push({
      id: `trace-${pendingSteps[0].id}`,
      type: "trace",
      steps: pendingSteps,
      status: "done",
      totalDurationSec: computeTraceDuration(pendingSteps, endIsoCandidate),
      collapsed,
      ...(hasAbortedTool || pendingRoundInterrupted ? { aborted: true } : {}),
      ...(pendingSummaryAcknowledged ? { summaryAcknowledged: true } : {}),
    } satisfies TraceMessage);
    pendingSteps = [];
    pendingSummaryAcknowledged = false;
    pendingRoundInterrupted = false;
  };

  /** 把 summaryAcknowledged 信号附加到「最近一个 trace」上：
   *  - 优先标记 pendingSteps（还未 flush 的 trace）—— 典型 think 模式回放路径
   *  - 否则向后扫 grouped 找最近一个 trace 回写——少见 case（mark_summary
   *    之后又产生新消息但同轮没出新 trace，例如旧数据迁移） */
  const markSummaryAcknowledged = () => {
    if (pendingSteps.length > 0) {
      pendingSummaryAcknowledged = true;
      return;
    }
    for (let i = grouped.length - 1; i >= 0; i--) {
      const m = grouped[i];
      if (m.type === "trace") {
        grouped[i] = { ...m, summaryAcknowledged: true };
        return;
      }
    }
  };

  /** interrupt-mark：把**本轮**最近一条 assistant 消息标 interrupted。
   *
   *  关键边界：向前扫到 user / widget 即停（它们是"轮次分隔符"）。这避免把上一轮
   *  已完成的 assistant 误标为 interrupted——典型场景是本轮 abort 时只有 trace
   *  还没产生任何 assistant 文本。这时在 trace flush 之后再追加空 assistant 占位。
   *
   *  不在此处 flush pendingSteps：abort 写库顺序可能导致 interrupt-mark 落在
   *  aborted tool 之前；若提前 flush 会把 thinking 与 tool 撕成两个 trace。 */
  const markLastAssistantInterrupted = (markerId: string) => {
    pendingRoundInterrupted = true;
    for (let i = grouped.length - 1; i >= 0; i--) {
      const m = grouped[i];
      if (m.type === "message" && m.role === "assistant") {
        if (!m.interrupted) {
          grouped[i] = { ...m, interrupted: true };
        }
        return;
      }
      // 跨越轮次分隔符（user 消息 / widget 卡）就停止：interrupt-mark 只能影响本轮
      if (m.type === "message" && m.role === "user") break;
      if (m.type === "widget") break;
      // trace 跳过继续往前找
    }
    // 本轮没找到 assistant 消息：trace flush 后再 append 占位气泡
    pendingInterruptedPlaceholderId = `${markerId}-interrupted-placeholder`;
  };

  const applyWidgetAnswerToTrace = (
    widgetId: string,
    answer: string | null,
    dismissed: boolean,
  ) => {
    for (let i = grouped.length - 1; i >= 0; i--) {
      const m = grouped[i];
      if (m.type !== "trace") continue;
      const hasStep = m.steps.some(
        (step) => step.type === "user_input" && step.widgetId === widgetId,
      );
      if (!hasStep) continue;
      grouped[i] = {
        ...m,
        steps: m.steps.map((step) =>
          step.type === "user_input" && step.widgetId === widgetId
            ? {
                ...step,
                status: dismissed ? "dismissed" : "answered",
                answer: answer ?? undefined,
              }
            : step,
        ),
      };
      return;
    }
  };

  for (const item of items) {
    if (item.type === "summary-mark") {
      markSummaryAcknowledged();
      continue;
    }
    if (item.type === "interrupt-mark") {
      markLastAssistantInterrupted(item.id);
      continue;
    }
    if (item.type === "message") {
      // assistant / user 都终止当前 trace；与流式 finalizeTrace 行为一致，默认折叠
      const endIso = item.createdAt;
      flushTrace(true, endIso);
      grouped.push(item);
      continue;
    }
    if (item.type === "widget") {
      if (pendingSteps.length > 0) {
        const traceId = `trace-${pendingSteps[0].id}`;
        pendingSteps.push({
          id: `user-input-${item.id}`,
          type: "user_input",
          widgetId: item.id,
          question: item.question,
          ...(item.widgetType === "form"
            ? { widgetKind: "form" as const, fields: item.fields }
            : {
                widgetKind: "choice" as const,
                choices: item.choices,
                allowFreeText: item.allowFreeText,
              }),
          status: "waiting",
        });
        flushTrace(true);
        grouped.push({ ...item, traceId });
        continue;
      }
      flushTrace(true);
      grouped.push(item);
      continue;
    }
    if (item.type === "thinking" || item.type === "tool") {
      pendingSteps.push(item);
    }
  }

  // 末尾残留：默认折叠（与新的流式 finalize 行为统一，用户可手动展开）
  flushTrace(true);

  if (pendingInterruptedPlaceholderId) {
    grouped.push({
      id: pendingInterruptedPlaceholderId,
      role: "assistant",
      type: "message",
      content: "",
      interrupted: true,
    });
    pendingInterruptedPlaceholderId = null;
  }

  // 历史加载：根据 widget 后紧跟的第一条用户消息推断答案状态，并将该用户消息从列表中移除
  // （widget 紧凑状态已展示答案，无需再显示用户气泡，与实时流体验保持一致）
  const widgetAnswerIndices = new Set<number>();
  const resumedTraceIndices = new Set<number>();
  for (let i = 0; i < grouped.length; i++) {
    const cur = grouped[i];
    if (cur.type !== "widget") continue;
    if (cur.widgetType === "form") {
      if (cur.submitted) continue;
    } else if (cur.answer !== undefined || cur.dismissed) {
      continue;
    }
    let found = false;
    for (let j = i + 1; j < grouped.length; j++) {
      const next = grouped[j];
      if (next.type === "trace") continue;
      if (next.type === "message" && next.role === "user") {
        if (cur.widgetType === "form") {
          grouped[i] = { ...cur, submitted: true };
          applyWidgetAnswerToTrace(cur.id, "已提交表单", false);
        } else {
          grouped[i] = { ...cur, answer: next.content };
          applyWidgetAnswerToTrace(cur.id, next.content, false);
        }
        widgetAnswerIndices.add(j);
        if (cur.traceId) {
          for (let k = j + 1; k < grouped.length; k++) {
            const maybeTrace = grouped[k];
            if (maybeTrace.type === "widget") break;
            if (maybeTrace.type === "message" && maybeTrace.role === "user") break;
            if (maybeTrace.type !== "trace") continue;
            const targetIdx = grouped.findIndex(
              (m) => m.type === "trace" && m.id === cur.traceId,
            );
            if (targetIdx !== -1 && targetIdx !== k) {
              const target = grouped[targetIdx] as TraceMessage;
              grouped[targetIdx] = {
                ...target,
                steps: [...target.steps, ...maybeTrace.steps],
                totalDurationSec:
                  (target.totalDurationSec ?? 0) + (maybeTrace.totalDurationSec ?? 0) || undefined,
                aborted: target.aborted || maybeTrace.aborted,
                summaryAcknowledged:
                  target.summaryAcknowledged || maybeTrace.summaryAcknowledged,
              };
              resumedTraceIndices.add(k);
            }
            break;
          }
        }
        found = true;
      }
      break;
    }
    if (!found) {
      if (cur.widgetType === "form") continue;
      grouped[i] = { ...cur, dismissed: true };
      applyWidgetAnswerToTrace(cur.id, null, true);
    }
  }

  return grouped.filter(
    (_, idx) => !widgetAnswerIndices.has(idx) && !resumedTraceIndices.has(idx),
  );
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

/** 将历史 API 单行 `ApiMessageRow` 映射为 FlatMessage。 */
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
  if (msg.role === "summary-mark") {
    return {
      id: msg.id,
      type: "summary-mark",
      ...(createdAt ? { createdAt } : {}),
    };
  }
  if (msg.role === "interrupt-mark") {
    return {
      id: msg.id,
      type: "interrupt-mark",
      ...(createdAt ? { createdAt } : {}),
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
        sources: normalizeCitationSources((payload as { sources?: unknown }).sources),
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
        fields?: Array<{
          name?: string;
          label?: string;
          type?: string;
          required?: boolean;
          placeholder?: string;
        }>;
      };
      if (payload.widgetType === "form") {
        const fields = (Array.isArray(payload.fields) ? payload.fields : [])
          .map((f) => {
            const name = typeof f.name === "string" ? f.name : "";
            const label = typeof f.label === "string" ? f.label : "";
            if (!name || !label) return null;
            const t = f.type;
            const fieldType: FormFieldDef["type"] =
              t === "password" || t === "email" || t === "number" || t === "text"
                ? t
                : "text";
            return {
              name,
              label,
              type: fieldType,
              required: f.required !== false,
              placeholder:
                typeof f.placeholder === "string" ? f.placeholder : undefined,
            } satisfies FormFieldDef;
          })
          .filter((x) => x !== null) as FormFieldDef[];
        return {
          id: msg.id,
          type: "widget",
          widgetType: "form",
          question: typeof payload.question === "string" ? payload.question : "",
          fields,
        } satisfies WidgetMessage;
      }
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
    citations: normalizeCitationSources(msg.citations),
    ...(createdAt ? { createdAt } : {}),
  };
}

/* ── 会话导出（Markdown）────────────────────────────────────────────────── */

/** 将 trace 步骤序列转为 Markdown「过程」小节。 */
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
    if (step.type === "user_input") {
      lines.push("", "### 用户补充", "", step.question || "需要用户补充信息");
      if (step.status === "answered" && step.answer?.trim()) {
        lines.push("", `- **回答**：${step.answer.trim()}`);
      } else if (step.status === "dismissed") {
        lines.push("", "- **状态**：已跳过");
      } else {
        lines.push("", "- **状态**：等待用户回答");
      }
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

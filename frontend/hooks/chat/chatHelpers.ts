/**
 * @fileoverview 聊天客户端共享常量与 localStorage 工具：模型选择、Agent ID、用量与 thinking 收尾。
 */
import type { Message } from "@/types/chat";
import type { ChatModelCatalogResponse } from "@/types/models";

/** localStorage 键：侧栏置顶会话 id 列表。 */
export const PINNED_IDS_KEY = "tcm_pinned_conversation_ids";
/** sessionStorage 键：未登录时暂存输入草稿。 */
export const PENDING_CHAT_DRAFT_KEY = "tcm_pending_chat_draft";
/** localStorage 键：默认 Agent id。 */
export const DEFAULT_AGENT_LS_KEY = "tcm_default_agent_id";
/** localStorage 键（遗留）：仅模型 id，无 provider。 */
export const CHAT_MODEL_LS_KEY = "tcm_chat_model";
/** localStorage 键：provider + model 组合选择。 */
export const CHAT_PICK_LS_KEY = "tcm_chat_pick";

/** 读取 localStorage 中的默认 Agent id。 */
export function readStoredDefaultAgentId(): string | null {
  try {
    const raw = localStorage.getItem(DEFAULT_AGENT_LS_KEY)?.trim();
    return raw || null;
  } catch {
    return null;
  }
}

/** 将 UI 选中的 Agent id 转为 SSE 请求体字段（空则 omit）。 */
export function agentIdForChatRequest(chatAgentId: string | null): string | undefined {
  const id = chatAgentId?.trim();
  return id ? id : undefined;
}

/** 读取持久化的 provider/model 选择。 */
export function readStoredPick(): { providerId: string; modelId: string } | null {
  try {
    const raw = localStorage.getItem(CHAT_PICK_LS_KEY)?.trim();
    if (!raw) return null;
    const j = JSON.parse(raw) as { providerId?: unknown; modelId?: unknown };
    if (typeof j.providerId !== "string" || typeof j.modelId !== "string") return null;
    return { providerId: j.providerId.trim(), modelId: j.modelId.trim() };
  } catch {
    return null;
  }
}

/** 持久化 provider/model 选择到 localStorage。 */
export function writeStoredPick(p: { providerId: string; modelId: string }) {
  try {
    localStorage.setItem(CHAT_PICK_LS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

/** 根据目录与 localStorage 解析初始 LLM provider/model。 */
export function resolveInitialPick(catalog: ChatModelCatalogResponse): {
  providerId: string;
  modelId: string;
} {
  const stored = readStoredPick();
  let legacyMid = "";
  try {
    legacyMid = localStorage.getItem(CHAT_MODEL_LS_KEY)?.trim() ?? "";
  } catch {
    /* ignore */
  }

  const defaultPid = catalog.default_llm_provider;
  const providers = catalog.providers;
  const firstConfigured =
    providers.find((p) => p.configured) ?? providers[0] ?? null;
  if (!firstConfigured || !firstConfigured.models.length) {
    return { providerId: defaultPid, modelId: "" };
  }

  let pid =
    stored?.providerId && providers.some((p) => p.id === stored.providerId)
      ? stored.providerId
      : defaultPid;
  let prov = providers.find((p) => p.id === pid) ?? firstConfigured;

  let mid =
    stored?.modelId && prov.models.some((m) => m.id === stored.modelId)
      ? stored.modelId
      : "";

  if (!mid && legacyMid) {
    const hitProvider = providers.find((p) =>
      p.models.some((m) => m.id === legacyMid),
    );
    if (hitProvider?.configured) {
      pid = hitProvider.id;
      prov = hitProvider;
      mid = legacyMid;
    } else if (prov.models.some((m) => m.id === legacyMid)) {
      mid = legacyMid;
    }
  }

  if (!mid) {
    mid =
      prov.models.find((m) => m.default)?.id ?? prov.models[0]?.id ?? "";
  }

  if (!prov.configured && firstConfigured) {
    prov = firstConfigured;
    pid = prov.id;
    mid =
      prov.models.find((m) => m.default)?.id ?? prov.models[0]?.id ?? "";
  }

  return { providerId: pid, modelId: mid };
}

/** 异步 sleep，用于 SSE 重试等短延迟。 */
export const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** 流结束时为 trace 内 thinking 步骤写入耗时并清理 start 记录。 */
export function applyFinalizeThinkingStepToMessages(
  msgs: Message[],
  traceId: string,
  stepId: string,
  starts: Record<string, number>,
): Message[] {
  const start = starts[stepId];
  if (start == null) return msgs;
  const sec = Math.max(0, (Date.now() - start) / 1000);
  delete starts[stepId];
  return msgs.map((m) =>
    m.type === "trace" && m.id === traceId
      ? {
          ...m,
          steps: m.steps.map((step) =>
            step.type === "thinking" && step.id === stepId
              ? { ...step, durationSec: sec }
              : step,
          ),
        }
      : m,
  );
}

/** 判断 fetch/流错误是否为用户主动 abort 或连接被关闭。 */
export function isLikelyUserAbort(err: unknown, signal: AbortSignal): boolean {
  if (signal.aborted) return true;
  if (
    typeof DOMException !== "undefined" &&
    err instanceof DOMException &&
    err.name === "AbortError"
  ) {
    return true;
  }
  if (err instanceof Error && err.name === "AbortError") return true;
  const msg =
    typeof err === "object" &&
    err !== null &&
    "message" in err &&
    typeof (err as { message: unknown }).message === "string"
      ? (err as { message: string }).message
      : "";
  return /aborted|The operation was aborted|premature close|ERR_STREAM_/i.test(msg);
}

/** 将 SSE `llm-usage` 片段归一化为 prompt/completion/total token 增量。 */
export function normalizedUsageDelta(u: unknown): {
  prompt: number;
  completion: number;
  total: number;
} {
  if (!u || typeof u !== "object") return { prompt: 0, completion: 0, total: 0 };
  const o = u as Record<string, unknown>;
  const prompt =
    typeof o.prompt_tokens === "number"
      ? o.prompt_tokens
      : typeof o.input_tokens === "number"
        ? o.input_tokens
        : 0;
  const completion =
    typeof o.completion_tokens === "number"
      ? o.completion_tokens
      : typeof o.output_tokens === "number"
        ? o.output_tokens
        : 0;
  let total = typeof o.total_tokens === "number" ? o.total_tokens : 0;
  if (!total && (prompt > 0 || completion > 0)) total = prompt + completion;
  return {
    prompt: Math.max(0, prompt),
    completion: Math.max(0, completion),
    total: Math.max(0, total),
  };
}

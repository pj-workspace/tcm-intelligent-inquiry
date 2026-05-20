import type { Message } from "@/types/chat";
import type { ChatModelCatalogResponse } from "@/types/models";

export const PINNED_IDS_KEY = "tcm_pinned_conversation_ids";
export const PENDING_CHAT_DRAFT_KEY = "tcm_pending_chat_draft";
export const DEFAULT_AGENT_LS_KEY = "tcm_default_agent_id";
export const CHAT_MODEL_LS_KEY = "tcm_chat_model";
export const CHAT_PICK_LS_KEY = "tcm_chat_pick";

export function readStoredDefaultAgentId(): string | null {
  try {
    const raw = localStorage.getItem(DEFAULT_AGENT_LS_KEY)?.trim();
    return raw || null;
  } catch {
    return null;
  }
}

export function agentIdForChatRequest(chatAgentId: string | null): string | undefined {
  const id = chatAgentId?.trim();
  return id ? id : undefined;
}

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

export function writeStoredPick(p: { providerId: string; modelId: string }) {
  try {
    localStorage.setItem(CHAT_PICK_LS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

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

export const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

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

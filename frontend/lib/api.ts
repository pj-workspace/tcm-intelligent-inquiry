/**
 * @fileoverview 后端 REST API 客户端：基址、鉴权头、错误解析与计费相关 fetch 封装。
 */

import type {
  BalanceSnapshotJson,
  ConversationBillingTotalsResponse,
  UsageEventsResponse,
  UsageSummaryResponse,
} from "@/types/billing";

/** 后端 API 根 URL；默认本地开发 8001 端口。 */
export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8001";

/** localStorage 中 JWT access token 的键名。 */
export const TOKEN_KEY = "tcm_access_token";

/**
 * 管理类接口使用 `require_api_user`：JWT + 可选 `API_KEY`。
 * 后端 `.env` 中 `API_KEY` 非空时，请求须带 `X-API-Key`（与后端值一致）。
 * 前端在 `.env.local` 配置 `NEXT_PUBLIC_API_KEY`（与后端 `API_KEY` 相同），构建时注入。
 */
export function apiHeaders(token: string | null): Record<string, string> {
  const h: Record<string, string> = {};
  if (token) h.Authorization = `Bearer ${token}`;
  const key = (process.env.NEXT_PUBLIC_API_KEY ?? "").trim();
  if (key) h["X-API-Key"] = key;
  return h;
}

/** 带 `Content-Type: application/json` 的 API 请求头。 */
export function apiJsonHeaders(token: string | null): Record<string, string> {
  return { ...apiHeaders(token), "Content-Type": "application/json" };
}

/** 从 FastAPI 错误响应中提取人类可读 message/detail。 */
export async function parseApiError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as {
      detail?: unknown;
      message?: unknown;
    };
    const msg = j.message;
    if (typeof msg === "string" && msg.trim()) return msg;
    const d = j.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d))
      return d.map((x: { msg?: string }) => x.msg ?? "").filter(Boolean).join("；");
  } catch {
    /* ignore */
  }
  return res.statusText || "请求失败";
}

/** GET /api/chat/billing/usage-summary */
export async function fetchBillingUsageSummary(
  token: string,
  opts?: { days?: number; providerId?: string | null },
): Promise<UsageSummaryResponse> {
  const days = opts?.days ?? 30;
  const q = new URLSearchParams({ days: String(days) });
  const pid = opts?.providerId?.trim();
  if (pid) q.set("provider_id", pid);
  const res = await fetch(`${API_BASE}/api/chat/billing/usage-summary?${q}`, {
    headers: apiHeaders(token),
  });
  if (!res.ok) throw new Error(await parseApiError(res));
  return (await res.json()) as UsageSummaryResponse;
}

/** GET /api/chat/billing/usage-events */
export async function fetchBillingUsageEvents(
  token: string,
  opts?: { limit?: number; offset?: number; providerId?: string | null },
): Promise<UsageEventsResponse> {
  const q = new URLSearchParams();
  if (opts?.limit != null) q.set("limit", String(opts.limit));
  if (opts?.offset != null) q.set("offset", String(opts.offset));
  const pid = opts?.providerId?.trim();
  if (pid) q.set("provider_id", pid);
  const qs = q.toString();
  const res = await fetch(
    `${API_BASE}/api/chat/billing/usage-events${qs ? `?${qs}` : ""}`,
    { headers: apiHeaders(token) },
  );
  if (!res.ok) throw new Error(await parseApiError(res));
  return (await res.json()) as UsageEventsResponse;
}

/** GET /api/chat/providers/{id}/balance */
export async function fetchProviderBalance(
  token: string,
  providerId: string,
): Promise<BalanceSnapshotJson> {
  const pid = providerId.trim().toLowerCase();
  const res = await fetch(`${API_BASE}/api/chat/providers/${encodeURIComponent(pid)}/balance`, {
    headers: apiHeaders(token),
  });
  if (!res.ok) throw new Error(await parseApiError(res));
  return (await res.json()) as BalanceSnapshotJson;
}

/** GET /api/chat/conversations/{id}/billing/usage-summary */
export async function fetchConversationBillingTotals(
  token: string,
  conversationId: string,
): Promise<ConversationBillingTotalsResponse> {
  const cid = conversationId.trim();
  const res = await fetch(
    `${API_BASE}/api/chat/conversations/${encodeURIComponent(cid)}/billing/usage-summary`,
    { headers: apiHeaders(token) },
  );
  if (!res.ok) throw new Error(await parseApiError(res));
  return (await res.json()) as ConversationBillingTotalsResponse;
}

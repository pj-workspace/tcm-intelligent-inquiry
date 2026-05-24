/**
 * @fileoverview 计费与 LLM 用量 API 响应类型，含 SSE `llm-usage` 归一化结构。
 */

/** GET /api/chat/billing/usage-summary — 统计周期起止 ISO 时间。 */
export type BillingPeriodOut = {
  start: string;
  end: string;
};

/** 聚合 token 与请求次数。 */
export type BillingTotalsOut = {
  requests: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

/** 按 LLM 厂商拆分的用量行。 */
export type BillingProviderBreakdownRow = {
  provider_id: string;
  requests: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

/** GET /api/chat/billing/usage-summary 完整响应。 */
export type UsageSummaryResponse = {
  period: BillingPeriodOut;
  totals: BillingTotalsOut;
  by_provider: BillingProviderBreakdownRow[];
};

/** GET /api/chat/conversations/{id}/billing/usage-summary 响应。 */
export type ConversationBillingTotalsResponse = {
  totals: BillingTotalsOut;
};

/** GET /api/chat/billing/usage-events 单条用量事件。 */
export type UsageEventItemOut = {
  usage_event_id: string;
  created_at: string;
  provider_id: string;
  chat_model: string | null;
  conversation_id: string | null;
  conversation_title: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
};

/** GET /api/chat/billing/usage-events 分页列表响应。 */
export type UsageEventsResponse = {
  items: UsageEventItemOut[];
  limit: number;
  offset: number;
};

/** GET /api/chat/providers/{id}/balance 单币种余额行。 */
export type BalanceLineItem = {
  currency: string;
  total_balance: string;
  granted_balance: string;
  topped_up_balance: string;
};

/** 厂商余额快照（含原始 JSON 与可用性标记）。 */
export type BalanceSnapshotJson = {
  provider_id: string;
  is_available: boolean | null;
  balances: BalanceLineItem[];
  raw: Record<string, unknown>;
};

/** SSE `type: "llm-usage"` 内嵌 normalize_llm_usage 输出 */

export type NormalizedLlmUsage = {
  provider_id?: string;
  prompt_tokens?: number;
  input_tokens?: number;
  completion_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  reasoning_tokens?: number;
  cached_prompt_tokens?: number;
  prompt_cache_miss_tokens?: number;
};

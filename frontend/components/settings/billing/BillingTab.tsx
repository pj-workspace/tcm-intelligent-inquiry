/**
 * @fileoverview 用量与账单 Tab：Provider 余额、汇总与事件明细。
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Loader2, PieChart, RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { SettingsEmptyResults } from "@/components/settings/shell/SettingsEmptyResults";
import { SettingsListToolbar } from "@/components/settings/shell/SettingsListToolbar";
import { SettingsPagination } from "@/components/settings/shell/SettingsPagination";
import { useSettingsListControls } from "@/components/settings/shell/useSettingsListControls";
import {
  fetchBillingUsageEvents,
  fetchBillingUsageSummary,
  fetchProviderBalance,
} from "@/lib/api";
import type { BalanceSnapshotJson, UsageSummaryResponse } from "@/types/billing";

const DAYS_OPTIONS = [7, 30, 90] as const;
const EVENTS_FETCH_LIMIT = 100;
const EVENTS_UI_PAGE_SIZE = 15;

type UsageEventRow = Awaited<
  ReturnType<typeof fetchBillingUsageEvents>
>["items"][number];

function eventMatchesQuery(row: UsageEventRow, query: string): boolean {
  const haystack = [
    row.provider_id,
    row.chat_model ?? "",
    row.conversation_title ?? "",
    fmtIsoShort(row.created_at),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

/** 用量事件关联会话的展示标题。 */
function eventConversationLabel(row: UsageEventRow): string {
  if (row.conversation_title?.trim()) return row.conversation_title.trim();
  if (row.conversation_id) return "未命名";
  return "—";
}

/** 本地化数字展示。 */
function fmtNum(n: number): string {
  return n.toLocaleString("zh-CN");
}

/** ISO 时间戳转简短本地日期时间。 */
function fmtIsoShort(iso: string): string {
  const t = iso?.trim();
  if (!t) return "—";
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return t.slice(0, 19);
  return d.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 账单事件行 token 数：优先 total，否则 prompt+completion。 */
function effectiveEventTokens(row: {
  total_tokens: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
}): number {
  if (row.total_tokens != null && row.total_tokens >= 0) return row.total_tokens;
  const p = row.prompt_tokens ?? 0;
  const c = row.completion_tokens ?? 0;
  return Math.max(0, p) + Math.max(0, c);
}

/** 用量与账单数据 Tab。 */
export function BillingTab() {
  const { token } = useAuth();
  const [days, setDays] = useState<(typeof DAYS_OPTIONS)[number]>(30);

  const [summary, setSummary] = useState<UsageSummaryResponse | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [balance, setBalance] = useState<BalanceSnapshotJson | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [balanceError, setBalanceError] = useState<string | null>(null);

  const [eventsRows, setEventsRows] = useState<
    Awaited<ReturnType<typeof fetchBillingUsageEvents>>["items"]
  >([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);

  const eventFilterFn = useCallback(
    (row: UsageEventRow, query: string) => eventMatchesQuery(row, query),
    [],
  );

  const eventsList = useSettingsListControls(eventsRows, {
    pageSize: EVENTS_UI_PAGE_SIZE,
    filter: eventFilterFn,
  });

  const loadSummary = useCallback(async () => {
    if (!token) return;
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const data = await fetchBillingUsageSummary(token, { days });
      setSummary(data);
    } catch (e) {
      setSummary(null);
      setSummaryError(e instanceof Error ? e.message : "加载用量汇总失败");
    } finally {
      setSummaryLoading(false);
    }
  }, [token, days]);

  const loadBalance = useCallback(async () => {
    if (!token) return;
    setBalanceLoading(true);
    setBalanceError(null);
    try {
      const data = await fetchProviderBalance(token, "deepseek");
      setBalance(data);
    } catch (e) {
      setBalance(null);
      setBalanceError(e instanceof Error ? e.message : "加载余额失败");
    } finally {
      setBalanceLoading(false);
    }
  }, [token]);

  const resetAndLoadEvents = useCallback(async () => {
    if (!token) return;
    setEventsLoading(true);
    setEventsError(null);
    setEventsRows([]);
    try {
      const page = await fetchBillingUsageEvents(token, {
        limit: EVENTS_FETCH_LIMIT,
        offset: 0,
      });
      setEventsRows(page.items);
    } catch (e) {
      setEventsRows([]);
      setEventsError(e instanceof Error ? e.message : "加载用量明细失败");
    } finally {
      setEventsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    void loadBalance();
  }, [loadBalance]);

  useEffect(() => {
    void resetAndLoadEvents();
  }, [resetAndLoadEvents]);

  const totals = summary?.totals;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600 ring-1 ring-orange-100">
          <PieChart className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-foreground">计费与用量</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            查看你的 AI 使用情况和账户余额。仅统计
            <strong className="font-medium text-foreground">当前登录账号</strong>
            下的对话，未登录时的聊天不会计入。
          </p>
        </div>
      </header>

      {/* DeepSeek 余额 */}
      <section className="rounded-2xl border border-card-border bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">DeepSeek 账户余额</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              余额反映<strong className="font-medium text-muted-foreground">部署侧配置的 API Key</strong>
              ，并非个人钱包；数值仅供参考。
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadBalance()}
            disabled={balanceLoading || !token}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${balanceLoading ? "animate-spin" : ""}`} />
            刷新
          </button>
        </div>

        <div className="mt-4">
          {balanceLoading && !balance ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              查询中…
            </div>
          ) : balanceError ? (
            <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2.5 text-sm text-amber-900">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <span>
                {balanceError}
                <span className="block mt-1 text-xs text-amber-800/90">
                  若为服务不可用或配置问题，请稍后重试或检查部署侧 DeepSeek Key 与网络。
                </span>
              </span>
            </div>
          ) : balance ? (
            <div className="space-y-2">
              {balance.is_available === false ? (
                <p className="text-xs text-amber-700">上游标记余额不可用，以下为最近一次快照。</p>
              ) : null}
              {balance.balances?.length ? (
                <ul className="divide-y divide-gray-100 rounded-xl border border-border bg-muted">
                  {balance.balances.map((line, i) => (
                    <li key={`${line.currency}-${i}`} className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-3 text-sm">
                      <span className="font-medium text-foreground">
                        {line.currency?.trim() || "余额"}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        总计 <strong className="text-foreground">{line.total_balance || "—"}</strong>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">暂无余额明细字段。</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">无法加载余额。</p>
          )}
        </div>
      </section>

      {/* 用量汇总 */}
      <section className="rounded-2xl border border-card-border bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">我的用量</h3>
          <div
            className="inline-flex max-w-full flex-wrap rounded-lg border border-border bg-surface-muted p-0.5"
            role="group"
            aria-label="统计区间天数"
          >
            {DAYS_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  days === d
                    ? "bg-surface text-orange-600 shadow-sm ring-1 ring-gray-200"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {d} 天
              </button>
            ))}
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          区间：滑动窗口，终点为请求时刻（服务端 UTC）；跨日边界以后端为准。
        </p>

        <div className="mt-4">
          {summaryLoading && !summary ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              加载汇总…
            </div>
          ) : summaryError ? (
            <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50/90 px-3 py-2.5 text-sm text-red-900">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              {summaryError}
            </div>
          ) : totals ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-border bg-muted px-4 py-3">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    请求次数
                  </div>
                  <div className="mt-1 text-xl font-semibold tabular-nums text-foreground">
                    {fmtNum(totals.requests)}
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-muted px-4 py-3">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Prompt tokens
                  </div>
                  <div className="mt-1 text-xl font-semibold tabular-nums text-foreground">
                    {fmtNum(totals.prompt_tokens)}
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-muted px-4 py-3">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Completion tokens
                  </div>
                  <div className="mt-1 text-xl font-semibold tabular-nums text-foreground">
                    {fmtNum(totals.completion_tokens)}
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-muted px-4 py-3">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    合计 tokens
                  </div>
                  <div className="mt-1 text-xl font-semibold tabular-nums text-foreground">
                    {fmtNum(totals.total_tokens)}
                  </div>
                </div>
              </div>

              {/* Mobile: provider cards */}
              <div className="mt-6 space-y-3 md:hidden">
                {summary!.by_provider.length === 0 ? (
                  <p className="rounded-xl border border-border px-4 py-8 text-center text-sm text-muted-foreground">
                    该区间内暂无用量记录
                  </p>
                ) : (
                  summary!.by_provider.map((row) => (
                    <div
                      key={row.provider_id}
                      className="rounded-xl border border-border bg-surface p-3 shadow-sm"
                    >
                      <div className="font-medium text-foreground">{row.provider_id}</div>
                      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                        <div>
                          <dt className="text-muted-foreground">请求</dt>
                          <dd className="tabular-nums font-medium text-foreground">
                            {fmtNum(row.requests)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">合计 tokens</dt>
                          <dd className="tabular-nums font-medium text-foreground">
                            {fmtNum(row.total_tokens)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Prompt</dt>
                          <dd className="tabular-nums text-foreground">
                            {fmtNum(row.prompt_tokens)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Completion</dt>
                          <dd className="tabular-nums text-foreground">
                            {fmtNum(row.completion_tokens)}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-6 hidden overflow-x-auto rounded-xl border border-border md:block">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-muted text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">厂商</th>
                      <th className="px-4 py-3 text-right">请求</th>
                      <th className="px-4 py-3 text-right">Prompt</th>
                      <th className="px-4 py-3 text-right">Completion</th>
                      <th className="px-4 py-3 text-right">合计</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-surface">
                    {summary!.by_provider.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                          该区间内暂无用量记录
                        </td>
                      </tr>
                    ) : (
                      summary!.by_provider.map((row) => (
                        <tr key={row.provider_id} className="hover:bg-muted/80">
                          <td className="px-4 py-2.5 font-medium text-foreground">
                            {row.provider_id}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                            {fmtNum(row.requests)}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                            {fmtNum(row.prompt_tokens)}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                            {fmtNum(row.completion_tokens)}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                            {fmtNum(row.total_tokens)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">暂无数据</p>
          )}
        </div>
      </section>

      {/* 最近请求 */}
      <section className="rounded-2xl border border-card-border bg-surface p-5 shadow-sm">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-foreground">最近请求</h3>
            <button
              type="button"
              onClick={() => void resetAndLoadEvents()}
              disabled={eventsLoading || !token}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${eventsLoading ? "animate-spin" : ""}`} />
              刷新列表
            </button>
          </div>

          {eventsRows.length > 0 && (
            <SettingsListToolbar
              query={eventsList.query}
              onQueryChange={eventsList.setQuery}
              placeholder="搜索厂商、模型或会话标题…"
              totalCount={eventsList.totalCount}
              filteredCount={eventsList.filteredCount}
            />
          )}

          {/* Mobile: event cards */}
          <div className="space-y-3 md:hidden">
          {eventsLoading && eventsRows.length === 0 ? (
            <p className="rounded-xl border border-border px-4 py-8 text-center text-sm text-muted-foreground">
              <Loader2 className="inline h-4 w-4 animate-spin" /> 加载中…
            </p>
          ) : eventsError ? (
            <div className="flex gap-2 rounded-xl border border-red-100 bg-red-50/80 p-3 text-sm text-red-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {eventsError}
            </div>
          ) : eventsRows.length === 0 ? (
            <p className="rounded-xl border border-border px-4 py-8 text-center text-sm text-muted-foreground">
              暂无事件
            </p>
          ) : eventsList.filteredCount === 0 ? (
            <SettingsEmptyResults
              query={eventsList.query}
              onClear={() => eventsList.setQuery("")}
            />
          ) : (
            eventsList.paginatedItems.map((ev) => (
              <div
                key={ev.usage_event_id}
                className="rounded-xl border border-border bg-surface p-3 shadow-sm"
              >
                <div className="text-xs text-muted-foreground">{fmtIsoShort(ev.created_at)}</div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <span className="font-medium text-foreground">{ev.provider_id}</span>
                  <span className="text-muted-foreground/40">·</span>
                  <span className="truncate text-muted-foreground">{ev.chat_model ?? "—"}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate text-muted-foreground">
                    {eventConversationLabel(ev)}
                  </span>
                  <span className="shrink-0 tabular-nums font-medium text-foreground">
                    {fmtNum(effectiveEventTokens(ev))} tokens
                  </span>
                </div>
              </div>
            ))
          )}
          </div>

          <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-muted text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">时间</th>
                <th className="px-4 py-3">厂商</th>
                <th className="px-4 py-3">模型</th>
                <th className="px-4 py-3">会话</th>
                <th className="px-4 py-3 text-right">Tokens</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-surface">
              {eventsLoading && eventsRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    <Loader2 className="inline h-4 w-4 animate-spin" /> 加载中…
                  </td>
                </tr>
              ) : eventsError ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6">
                    <div className="flex gap-2 text-red-800">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      {eventsError}
                    </div>
                  </td>
                </tr>
              ) : eventsRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    暂无事件
                  </td>
                </tr>
              ) : eventsList.filteredCount === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6">
                    <SettingsEmptyResults
                      query={eventsList.query}
                      onClear={() => eventsList.setQuery("")}
                    />
                  </td>
                </tr>
              ) : (
                eventsList.paginatedItems.map((ev) => (
                  <tr key={ev.usage_event_id} className="hover:bg-muted/80">
                    <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">
                      {fmtIsoShort(ev.created_at)}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-foreground">{ev.provider_id}</td>
                    <td className="max-w-[12rem] truncate px-4 py-2.5 text-muted-foreground">
                      {ev.chat_model ?? "—"}
                    </td>
                    <td className="max-w-[14rem] truncate px-4 py-2.5 text-foreground">
                      {eventConversationLabel(ev)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                      {fmtNum(effectiveEventTokens(ev))}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>

          <SettingsPagination
            page={eventsList.page}
            totalPages={eventsList.totalPages}
            onPageChange={eventsList.setPage}
            filteredCount={eventsList.filteredCount}
            pageSize={eventsList.pageSize}
          />
        </div>
      </section>
    </div>
  );
}

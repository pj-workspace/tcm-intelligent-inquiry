/**
 * @fileoverview 用量与账单 Tab：Provider 余额、汇总与事件明细。
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Loader2, PieChart, RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import {
  fetchBillingUsageEvents,
  fetchBillingUsageSummary,
  fetchProviderBalance,
} from "@/lib/api";
import type { BalanceSnapshotJson, UsageSummaryResponse } from "@/types/billing";

const DAYS_OPTIONS = [7, 30, 90] as const;
const EVENTS_PAGE = 25;

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

  const [eventsOffset, setEventsOffset] = useState(0);
  const [eventsRows, setEventsRows] = useState<
    Awaited<ReturnType<typeof fetchBillingUsageEvents>>["items"]
  >([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [eventsHasMore, setEventsHasMore] = useState(false);

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
    setEventsOffset(0);
    setEventsRows([]);
    try {
      const page = await fetchBillingUsageEvents(token, {
        limit: EVENTS_PAGE,
        offset: 0,
      });
      setEventsRows(page.items);
      setEventsHasMore(page.items.length === page.limit);
    } catch (e) {
      setEventsRows([]);
      setEventsHasMore(false);
      setEventsError(e instanceof Error ? e.message : "加载用量明细失败");
    } finally {
      setEventsLoading(false);
    }
  }, [token]);

  const loadMoreEvents = useCallback(async () => {
    if (!token || eventsLoading || !eventsHasMore) return;
    const nextOff = eventsOffset + EVENTS_PAGE;
    setEventsLoading(true);
    setEventsError(null);
    try {
      const page = await fetchBillingUsageEvents(token, {
        limit: EVENTS_PAGE,
        offset: nextOff,
      });
      setEventsRows((prev) => [...prev, ...page.items]);
      setEventsOffset(nextOff);
      setEventsHasMore(page.items.length === page.limit && page.items.length > 0);
    } catch (e) {
      setEventsError(e instanceof Error ? e.message : "加载更多失败");
    } finally {
      setEventsLoading(false);
    }
  }, [token, eventsLoading, eventsHasMore, eventsOffset]);

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
          <h2 className="text-lg font-semibold text-gray-900">计费与用量</h2>
          <p className="mt-1 text-sm leading-relaxed text-gray-500">
            用量按<strong className="font-medium text-gray-700">当前登录账号</strong>
            聚合；匿名会话写入的事件不会计入此处。
            当前入库主要来自 DeepSeek 等流式路径，不等同于「全厂商」口径。
          </p>
        </div>
      </header>

      {/* DeepSeek 余额 */}
      <section className="rounded-2xl border border-[#e8e4dc] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">DeepSeek 账户余额</h3>
            <p className="mt-1 text-xs leading-relaxed text-gray-500">
              余额反映<strong className="font-medium text-gray-600">部署侧配置的 API Key</strong>
              ，并非个人钱包；数值仅供参考。
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadBalance()}
            disabled={balanceLoading || !token}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${balanceLoading ? "animate-spin" : ""}`} />
            刷新
          </button>
        </div>

        <div className="mt-4">
          {balanceLoading && !balance ? (
            <div className="flex items-center gap-2 text-sm text-gray-400">
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
                <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100 bg-[#fafaf9]">
                  {balance.balances.map((line, i) => (
                    <li key={`${line.currency}-${i}`} className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-3 text-sm">
                      <span className="font-medium text-gray-800">
                        {line.currency?.trim() || "余额"}
                      </span>
                      <span className="tabular-nums text-gray-600">
                        总计 <strong className="text-gray-900">{line.total_balance || "—"}</strong>
                      </span>
                      {(line.granted_balance || line.topped_up_balance) && (
                        <span className="text-xs text-gray-400">
                          赠送 {line.granted_balance || "—"} · 充值 {line.topped_up_balance || "—"}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">暂无余额明细字段。</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500">无法加载余额。</p>
          )}
        </div>
      </section>

      {/* 用量汇总 */}
      <section className="rounded-2xl border border-[#e8e4dc] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-gray-900">我的用量</h3>
          <div
            className="inline-flex rounded-lg border border-gray-200 bg-[#fbfaf7] p-0.5"
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
                    ? "bg-white text-orange-600 shadow-sm ring-1 ring-gray-200"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {d} 天
              </button>
            ))}
          </div>
        </div>
        <p className="mt-2 text-xs text-gray-400">
          区间：滑动窗口，终点为请求时刻（服务端 UTC）；跨日边界以后端为准。
        </p>

        <div className="mt-4">
          {summaryLoading && !summary ? (
            <div className="flex items-center gap-2 text-sm text-gray-400">
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
                <div className="rounded-xl border border-gray-100 bg-[#fafaf9] px-4 py-3">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                    请求次数
                  </div>
                  <div className="mt-1 text-xl font-semibold tabular-nums text-gray-900">
                    {fmtNum(totals.requests)}
                  </div>
                </div>
                <div className="rounded-xl border border-gray-100 bg-[#fafaf9] px-4 py-3">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                    Prompt tokens
                  </div>
                  <div className="mt-1 text-xl font-semibold tabular-nums text-gray-900">
                    {fmtNum(totals.prompt_tokens)}
                  </div>
                </div>
                <div className="rounded-xl border border-gray-100 bg-[#fafaf9] px-4 py-3">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                    Completion tokens
                  </div>
                  <div className="mt-1 text-xl font-semibold tabular-nums text-gray-900">
                    {fmtNum(totals.completion_tokens)}
                  </div>
                </div>
                <div className="rounded-xl border border-gray-100 bg-[#fafaf9] px-4 py-3">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                    合计 tokens
                  </div>
                  <div className="mt-1 text-xl font-semibold tabular-nums text-gray-900">
                    {fmtNum(totals.total_tokens)}
                  </div>
                </div>
              </div>

              <div className="mt-6 overflow-x-auto rounded-xl border border-gray-100">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-[#f7f6f3] text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-4 py-3">厂商</th>
                      <th className="px-4 py-3 text-right">请求</th>
                      <th className="px-4 py-3 text-right">Prompt</th>
                      <th className="px-4 py-3 text-right">Completion</th>
                      <th className="px-4 py-3 text-right">合计</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {summary!.by_provider.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                          该区间内暂无用量记录
                        </td>
                      </tr>
                    ) : (
                      summary!.by_provider.map((row) => (
                        <tr key={row.provider_id} className="hover:bg-gray-50/80">
                          <td className="px-4 py-2.5 font-medium text-gray-800">
                            {row.provider_id}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                            {fmtNum(row.requests)}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                            {fmtNum(row.prompt_tokens)}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                            {fmtNum(row.completion_tokens)}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-gray-900">
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
            <p className="text-sm text-gray-500">暂无数据</p>
          )}
        </div>
      </section>

      {/* 最近请求 */}
      <section className="rounded-2xl border border-[#e8e4dc] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-gray-900">最近请求</h3>
          <button
            type="button"
            onClick={() => void resetAndLoadEvents()}
            disabled={eventsLoading || !token}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${eventsLoading ? "animate-spin" : ""}`} />
            刷新列表
          </button>
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-gray-100">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#f7f6f3] text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">时间</th>
                <th className="px-4 py-3">厂商</th>
                <th className="px-4 py-3">模型</th>
                <th className="px-4 py-3">会话 ID</th>
                <th className="px-4 py-3 text-right">Tokens</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {eventsLoading && eventsRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
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
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    暂无事件
                  </td>
                </tr>
              ) : (
                eventsRows.map((ev) => (
                  <tr key={ev.usage_event_id} className="hover:bg-gray-50/80">
                    <td className="whitespace-nowrap px-4 py-2.5 text-gray-600">
                      {fmtIsoShort(ev.created_at)}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-gray-800">{ev.provider_id}</td>
                    <td className="max-w-[12rem] truncate px-4 py-2.5 text-gray-600">
                      {ev.chat_model ?? "—"}
                    </td>
                    <td className="max-w-[14rem] truncate px-4 py-2.5 font-mono text-xs text-gray-500">
                      {ev.conversation_id ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-900">
                      {fmtNum(effectiveEventTokens(ev))}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {eventsHasMore && eventsRows.length > 0 ? (
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={() => void loadMoreEvents()}
              disabled={eventsLoading}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
            >
              {eventsLoading ? "加载中…" : "加载更多"}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

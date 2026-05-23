/**
 * @fileoverview 单个 MCP 服务器卡片：端点摘要、刷新工具列表与删除。
 */
"use client";

import { RefreshCw, Trash2, ChevronDown, Plug, Terminal } from "lucide-react";
import type { McpServer } from "@/types/mcp";

interface McpServerCardProps {
  server: McpServer;
  isRefreshing: boolean;
  isExpanded: boolean;
  onRefresh: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleTools: (id: string) => void;
}

/** 格式化 MCP 端点展示（stdio 命令或 URL）。 */
function endpointLabel(server: McpServer): string {
  if (server.transport === "stdio" && server.stdio) {
    const args =
      server.stdio.args.length > 0 ? ` ${server.stdio.args.join(" ")}` : "";
    return `${server.stdio.command}${args}`;
  }
  return server.url ?? "—";
}

/** MCP 服务器列表项卡片。 */
export function McpServerCard({
  server,
  isRefreshing,
  isExpanded,
  onRefresh,
  onDelete,
  onToggleTools,
}: McpServerCardProps) {
  const isStdio = server.transport === "stdio";

  return (
    <div className="overflow-hidden rounded-xl border border-[#e5e5e5] bg-white shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between border-b border-gray-50 p-5">
        <div className="flex items-start gap-3">
          <div
            className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
              isStdio ? "bg-violet-50 text-violet-600" : "bg-blue-50 text-blue-600"
            }`}
          >
            {isStdio ? (
              <Terminal className="h-5 w-5" />
            ) : (
              <Plug className="h-5 w-5" />
            )}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-gray-900">{server.name}</h3>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                  isStdio
                    ? "bg-violet-50 text-violet-700"
                    : "bg-blue-50 text-blue-700"
                }`}
              >
                {isStdio ? "stdio" : "HTTP"}
              </span>
              {server.enabled ? (
                <span className="rounded bg-green-50 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
                  启用
                </span>
              ) : (
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                  禁用
                </span>
              )}
            </div>
            <p className="mt-1 break-all font-mono text-xs text-gray-500">
              {endpointLabel(server)}
            </p>
            {server.description && (
              <p className="mt-1.5 text-sm text-gray-600">{server.description}</p>
            )}

            <div className="mt-3 flex items-center gap-2 text-xs">
              {server.last_probe_error ? (
                <div className="flex items-center gap-1.5 rounded bg-red-50 px-2 py-1 text-red-600">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500"></span>
                  </span>
                  探测失败：{server.last_probe_error}
                </div>
              ) : server.last_probe_at ? (
                <span className="text-gray-400">
                  上次成功探测:{" "}
                  {new Date(server.last_probe_at).toLocaleString()}
                </span>
              ) : (
                <span className="text-gray-400">从未探测</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onRefresh(server.id)}
            disabled={isRefreshing}
            title="刷新工具"
            className="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
            />
          </button>
          <button
            onClick={() => onDelete(server.id)}
            title="删除"
            className="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="bg-[#fafaf8] px-5 py-3">
        <button
          onClick={() => onToggleTools(server.id)}
          className="flex w-full items-center justify-between rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900"
        >
          <span>已发现 {server.tool_names.length} 个工具</span>
          <ChevronDown
            className={`h-4 w-4 text-gray-400 transition-transform ${
              isExpanded ? "rotate-180" : ""
            }`}
          />
        </button>

        {isExpanded && server.tool_names.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 pb-1">
            {server.tool_names.map((t) => (
              <span
                key={t}
                className="rounded border border-[#e5e5e5] bg-white px-2 py-1 font-mono text-[11px] text-gray-600 shadow-sm"
              >
                {t}
              </span>
            ))}
          </div>
        )}
        {isExpanded && server.tool_names.length === 0 && (
          <div className="mt-3 pb-1 text-xs text-gray-400">
            未能从该 MCP 服务发现可用工具。
          </div>
        )}
      </div>
    </div>
  );
}

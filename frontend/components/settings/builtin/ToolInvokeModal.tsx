/**
 * @fileoverview 内置工具试调用模态：根据 schema 渲染参数表单并展示 JSON 结果。
 */
"use client";

import { forwardRef, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertCircle,
  BookOpen,
  Clock,
  Database,
  Globe,
  Play,
  Settings,
  Terminal,
  Users,
  X,
} from "lucide-react";
import { API_BASE, apiJsonHeaders } from "@/lib/api";
import { buildToolInvokeInitialValues } from "@/lib/builtin-tool-demo-values";
import { useAuth } from "@/contexts/auth-context";
import type { BuiltinToolInfo, ToolCategory } from "@/types/tool";
import { uiModalBackdrop, uiModalPanel } from "@/lib/ui-motion";

const CATEGORY_META: Record<ToolCategory, { color: string; bg: string; Icon: React.ElementType }> =
  {
    knowledge: { color: "text-orange-600", bg: "bg-orange-50", Icon: Database },
    formula: { color: "text-emerald-600", bg: "bg-emerald-50", Icon: BookOpen },
    web: { color: "text-blue-600", bg: "bg-blue-50", Icon: Globe },
    system: { color: "text-gray-500", bg: "bg-gray-100", Icon: Settings },
    mcp: { color: "text-violet-600", bg: "bg-violet-50", Icon: Terminal },
  };

interface ToolInvokeModalProps {
  tool: BuiltinToolInfo;
  onClose: () => void;
}

/** 单工具调试调用弹窗。 */
export const ToolInvokeModal = forwardRef<HTMLDivElement, ToolInvokeModalProps>(
  function ToolInvokeModal({ tool, onClose }, ref) {
  const { token } = useAuth();
  const meta = CATEGORY_META[tool.category] ?? CATEGORY_META.system;
  const { Icon } = meta;

  const [values, setValues] = useState<Record<string, string>>(() =>
    buildToolInvokeInitialValues(tool)
  );
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ text: string; elapsed_ms: number } | null>(null);
  const [invokeError, setInvokeError] = useState<string | null>(null);

  // 第一行作简介，其余行作详细描述
  const descLines = tool.description.split("\n").map((l) => l.trim()).filter(Boolean);
  const summary = descLines[0] ?? "";
  const detail = descLines.slice(1).join("\n");

  const handleRun = async () => {
    if (!token) return;
    setRunning(true);
    setResult(null);
    setInvokeError(null);
    try {
      const args: Record<string, unknown> = {};
      for (const arg of tool.args_schema) {
        const raw = values[arg.name];
        if (raw === "" || raw === undefined) continue;
        if (arg.type === "integer") args[arg.name] = parseInt(raw, 10);
        else if (arg.type === "number") args[arg.name] = parseFloat(raw);
        else if (arg.type === "boolean") args[arg.name] = raw === "true";
        else args[arg.name] = raw;
      }
      const res = await fetch(`${API_BASE}/api/agents/tools/${tool.name}/invoke`, {
        method: "POST",
        headers: apiJsonHeaders(token),
        body: JSON.stringify({ args }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { result: string; elapsed_ms: number };
      setResult({ text: data.result, elapsed_ms: data.elapsed_ms });
    } catch (err) {
      setInvokeError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <motion.div
      ref={ref}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      {...uiModalBackdrop}
    >
      <motion.div
        className="flex h-[min(90dvh,100dvh)] w-full max-w-2xl flex-col rounded-none bg-white shadow-2xl sm:h-[88vh] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        {...uiModalPanel}
      >
        {/* ── 头部 ── */}
        <div className="flex items-start justify-between border-b border-gray-100 px-6 py-5">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${meta.bg} ${meta.color}`}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-gray-900">{tool.label}</h2>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${meta.bg} ${meta.color}`}
                >
                  {tool.category}
                </span>
              </div>
              <p className="mt-0.5 font-mono text-xs text-gray-400">{tool.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── 滚动主体 ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* 描述 */}
          <div>
            <p className="text-sm font-medium text-gray-700">{summary}</p>
            {detail && (
              <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-gray-500">
                {detail}
              </p>
            )}
            {tool.used_by_agents > 0 && (
              <div className="mt-3 flex items-center gap-1.5 text-xs text-gray-400">
                <Users className="h-3.5 w-3.5" />
                被 <span className="font-medium text-gray-600">{tool.used_by_agents}</span> 个
                Agent 使用
              </div>
            )}
          </div>

          {/* 参数表 */}
          {tool.args_schema.length > 0 && (
            <div>
              <div className="mb-3 flex items-center gap-2 text-xs font-medium text-gray-500">
                <span>参数列表</span>
                <div className="h-px flex-1 bg-gray-100" />
              </div>
              <table className="w-full text-xs">
                <colgroup>
                  <col className="w-36" />
                  <col className="w-20" />
                  <col className="w-28" />
                  <col />
                </colgroup>
                <thead>
                  <tr className="text-left text-gray-400">
                    <th className="pb-2 pr-4 font-medium">参数名</th>
                    <th className="pb-2 pr-4 font-medium">类型</th>
                    <th className="pb-2 pr-4 font-medium">必填</th>
                    <th className="pb-2 font-medium">说明</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {tool.args_schema.map((arg) => (
                    <tr key={arg.name} className="align-middle">
                      <td className="py-2 pr-4 font-mono text-gray-700">{arg.name}</td>
                      <td className="py-2 pr-4">
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-gray-500">
                          {arg.type}
                        </span>
                      </td>
                      <td className="py-2 pr-4">
                        {arg.required ? (
                          <span className="font-medium text-red-500">是</span>
                        ) : (
                          <span className="text-gray-400">
                            否
                            {arg.default !== null && arg.default !== undefined
                              ? `（默认 ${String(arg.default)}）`
                              : ""}
                          </span>
                        )}
                      </td>
                      <td className="py-2 leading-relaxed text-gray-500">
                        {arg.description || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 在线试用 */}
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-medium text-gray-500">
              <Play className="h-3.5 w-3.5 text-orange-500" />
              <span>在线试用</span>
              <div className="h-px flex-1 bg-gray-100" />
            </div>

            {tool.args_schema.length === 0 ? (
              <p className="mb-3 text-xs text-gray-400">此工具无需参数，直接执行即可。</p>
            ) : (
              <div className="space-y-3">
                {tool.args_schema.map((arg) => (
                  <div key={arg.name}>
                    <label className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-700">
                      <span className="font-mono">{arg.name}</span>
                      <span className="rounded bg-gray-100 px-1 text-[10px] text-gray-400">
                        {arg.type}
                      </span>
                      {arg.required && <span className="text-red-500">*</span>}
                    </label>
                    {arg.type === "boolean" ? (
                      <select
                        value={values[arg.name] ?? "false"}
                        onChange={(e) =>
                          setValues((v) => ({ ...v, [arg.name]: e.target.value }))
                        }
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
                      >
                        <option value="true">true</option>
                        <option value="false">false</option>
                      </select>
                    ) : (
                      <input
                        type={
                          arg.type === "integer" || arg.type === "number" ? "number" : "text"
                        }
                        value={values[arg.name] ?? ""}
                        onChange={(e) =>
                          setValues((v) => ({ ...v, [arg.name]: e.target.value }))
                        }
                        placeholder={
                          arg.default !== null && arg.default !== undefined
                            ? `默认: ${String(arg.default)}`
                            : arg.required
                            ? "必填"
                            : "可选"
                        }
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
                      />
                    )}
                    {arg.description && (
                      <p className="mt-1 text-xs text-gray-400">{arg.description}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

          </div>
        </div>

        {/* ── 底部固定区：结果 + 操作按钮 ── */}
        <div className="shrink-0 border-t border-gray-100">
          {/* 执行结果 —— 始终可见，不随上方内容滚动 */}
          {(result || invokeError) && (
            <div className="px-6 pt-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-gray-500">
                {invokeError ? (
                  <>
                    <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                    执行出错
                  </>
                ) : (
                  <>
                    <Clock className="h-3.5 w-3.5" />
                    执行完成 · {result!.elapsed_ms} ms
                  </>
                )}
              </div>
              <pre className="max-h-48 min-h-[3rem] overflow-auto rounded-lg bg-gray-50 p-3 text-xs leading-relaxed text-gray-700 ring-1 ring-inset ring-gray-200 whitespace-pre-wrap break-words">
                {invokeError ?? result!.text}
              </pre>
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex justify-end gap-3 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
            >
              关闭
            </button>
            <button
              type="button"
              disabled={running}
              onClick={handleRun}
              className="flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-orange-600 disabled:opacity-50"
            >
              {running ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {running ? "执行中…" : "执行"}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
});

ToolInvokeModal.displayName = "ToolInvokeModal";

"use client";

import { useState } from "react";
import { Check, ChevronDown, ChevronUp, FileJson } from "lucide-react";
import {
  applyMcpParseResult,
  parseMcpJson,
  type McpParseResult,
  type McpTransport,
} from "@/lib/mcp/parseMcpConfig";

export type { McpTransport };
export { parseArgsText, parseEnvText } from "@/lib/mcp/parseMcpConfig";

export interface McpFormData {
  name: string;
  transport: McpTransport;
  url: string;
  command: string;
  argsText: string;
  envText: string;
  description: string;
  authToken: string;
  /** 整份 Cursor mcpServers，走批量导入 API */
  bulkImport: Record<string, Record<string, unknown>> | null;
}

interface McpAddFormProps {
  formData: McpFormData;
  setFormData: React.Dispatch<React.SetStateAction<McpFormData>>;
  isSubmitting: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}

function applyParseResult(
  setFormData: React.Dispatch<React.SetStateAction<McpFormData>>,
  parsed: McpParseResult
) {
  setFormData((prev) => applyMcpParseResult(prev, parsed));
}

export function McpAddForm({
  formData,
  setFormData,
  isSubmitting,
  onSubmit,
  onCancel,
}: McpAddFormProps) {
  const [showJson, setShowJson] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState("");

  const bulkCount = formData.bulkImport
    ? Object.keys(formData.bulkImport).length
    : 0;

  const [stdioPasteText, setStdioPasteText] = useState("");
  const [stdioPasteError, setStdioPasteError] = useState("");
  const [stdioPasteOk, setStdioPasteOk] = useState(false);

  const runParse = (
    value: string,
    onError: (msg: string) => void,
    onClear: () => void
  ): McpParseResult | null => {
    if (!value.trim()) {
      onClear();
      return null;
    }
    const parsed = parseMcpJson(value);
    if (!parsed) {
      onError(
        "无法解析：支持整份 mcpServers、单条 \"服务名\": { command, args }、或 { command, args }"
      );
      return null;
    }
    onClear();
    applyParseResult(setFormData, parsed);
    return parsed;
  };

  const handleJsonPaste = (value: string) => {
    setJsonText(value);
    runParse(
      value,
      (msg) => setJsonError(msg),
      () => setJsonError("")
    );
  };

  const handleStdioPaste = (value: string) => {
    setStdioPasteText(value);
    const parsed = runParse(
      value,
      (msg) => {
        setStdioPasteError(msg);
        setStdioPasteOk(false);
      },
      () => {
        setStdioPasteError("");
        setStdioPasteOk(false);
      }
    );
    if (parsed && !parsed.bulkImport) {
      setStdioPasteOk(true);
    } else if (parsed?.bulkImport) {
      setStdioPasteError("检测到多个服务，请改用上方 JSON 导入区批量导入");
      setStdioPasteOk(false);
    }
  };

  const isBulk = bulkCount > 0;
  const isStdio = !isBulk && formData.transport === "stdio";

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
    >
      <div className="mb-4 text-sm font-medium text-gray-900">添加新服务</div>

      <div className="mb-4 rounded-lg border border-dashed border-gray-200 bg-gray-50">
        <button
          type="button"
          onClick={() => setShowJson((v) => !v)}
          className="flex w-full items-center gap-2 px-4 py-3 text-xs font-medium text-gray-500 hover:text-gray-700"
        >
          <FileJson className="h-4 w-4 text-orange-400" />
          从 JSON 配置导入（粘贴 Cursor / Claude Desktop mcp.json）
          {showJson ? (
            <ChevronUp className="ml-auto h-4 w-4" />
          ) : (
            <ChevronDown className="ml-auto h-4 w-4" />
          )}
        </button>
        {showJson && (
          <div className="border-t border-gray-200 px-4 pb-4 pt-3">
            <textarea
              rows={6}
              className={`w-full rounded-md border px-3 py-2 font-mono text-xs outline-none focus:ring-1 ${
                jsonError
                  ? "border-red-300 focus:border-red-400 focus:ring-red-300"
                  : "border-gray-300 focus:border-orange-400 focus:ring-orange-400"
              }`}
              placeholder={`整份 mcpServers，或单条：\n"qq-mail": {\n  "command": "docker",\n  "args": ["compose", "-f", "/path/docker-compose.yml", "run", "qq-mail-mcp"]\n}`}
              value={jsonText}
              onChange={(e) => handleJsonPaste(e.target.value)}
            />
            {jsonError && (
              <p className="mt-1 text-xs text-red-600">{jsonError}</p>
            )}
            {!jsonError && isBulk && (
              <p className="mt-1 text-xs text-green-600">
                ✓ 将批量导入 {bulkCount} 个 MCP 服务（含 stdio command 与 HTTP url）
              </p>
            )}
            {!jsonError && jsonText.trim() && !isBulk && (
              <p className="mt-1 text-xs text-green-600">✓ 已自动填入下方字段</p>
            )}
          </div>
        )}
      </div>

      {isBulk ? (
        <div className="rounded-lg border border-orange-100 bg-orange-50 px-4 py-3 text-sm text-orange-900">
          <p className="font-medium">批量导入模式</p>
          <p className="mt-1 text-xs text-orange-800">
            将注册以下服务并由后端拉起本地进程（docker / uv / bash 等，需后端运行环境可执行）：
          </p>
          <ul className="mt-2 list-inside list-disc font-mono text-xs text-orange-900">
            {Object.keys(formData.bulkImport!).map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <div className="mb-4 flex gap-2">
            {(["http", "stdio"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setFormData({ ...formData, transport: t })}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  formData.transport === t
                    ? "bg-black text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {t === "http" ? "HTTP / SSE" : "stdio（本地 command）"}
              </button>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-medium text-gray-700">
                服务名称 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
                placeholder="例如：paper-search-mcp"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
            </div>

            {isStdio ? (
              <>
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs font-medium text-gray-700">
                    快速粘贴（Cursor 单条 stdio，可直接复制 mcp.json 里的一段）
                  </label>
                  <textarea
                    rows={5}
                    className={`w-full rounded-md border px-3 py-2 font-mono text-xs outline-none focus:ring-1 ${
                      stdioPasteError
                        ? "border-red-300 focus:border-red-400 focus:ring-red-300"
                        : stdioPasteOk
                          ? "border-green-300 focus:border-green-400 focus:ring-green-300"
                          : "border-gray-300 focus:border-orange-400 focus:ring-orange-400"
                    }`}
                    placeholder={`"qq-mail": {\n  "command": "docker",\n  "args": [\n    "compose",\n    "-f",\n    "/Users/you/Mcp/qq-mail-mcp-server/docker-compose.yml",\n    "run", "--rm", "-i", "-T", "qq-mail-mcp"\n  ]\n}`}
                    value={stdioPasteText}
                    onChange={(e) => handleStdioPaste(e.target.value)}
                  />
                  {stdioPasteError && (
                    <p className="text-xs text-red-600">{stdioPasteError}</p>
                  )}
                  {stdioPasteOk && (
                    <p className="text-xs text-green-600">
                      ✓ 已解析并填入下方字段（服务名、command、args、env）
                    </p>
                  )}
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs font-medium text-gray-700">
                    command <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
                    placeholder="/Users/you/.local/bin/uv 或 docker"
                    value={formData.command}
                    onChange={(e) =>
                      setFormData({ ...formData, command: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs font-medium text-gray-700">
                    args（每行一个，或 JSON 数组）
                  </label>
                  <textarea
                    rows={4}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-xs outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
                    placeholder={'run\n--directory\n/path/to/project\n-m\nmodule'}
                    value={formData.argsText}
                    onChange={(e) =>
                      setFormData({ ...formData, argsText: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs font-medium text-gray-700">
                    env（JSON 对象，可选）
                  </label>
                  <textarea
                    rows={3}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-xs outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
                    placeholder={'{\n  "MCP_TRANSPORT": "stdio"\n}'}
                    value={formData.envText}
                    onChange={(e) =>
                      setFormData({ ...formData, envText: e.target.value })
                    }
                  />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs font-medium text-gray-700">
                    URL <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="url"
                    required
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
                    placeholder="https://example.com/mcp"
                    value={formData.url}
                    onChange={(e) =>
                      setFormData({ ...formData, url: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs font-medium text-gray-700">
                    Bearer Token（可选）
                  </label>
                  <input
                    type="password"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
                    placeholder="留空则不带 Authorization 头"
                    value={formData.authToken}
                    onChange={(e) =>
                      setFormData({ ...formData, authToken: e.target.value })
                    }
                  />
                </div>
              </>
            )}

            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-medium text-gray-700">
                说明（可选）
              </label>
              <input
                type="text"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
                placeholder="提供搜索能力的外部服务…"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
              />
            </div>
          </div>
        </>
      )}

      <div className="mt-5 flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
        >
          取消
        </button>
        <button
          type="submit"
          disabled={isSubmitting || (isBulk && bulkCount === 0)}
          className="flex items-center gap-2 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-gray-800 disabled:opacity-50"
        >
          {isSubmitting ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          {isSubmitting
            ? "连接探测中，请稍候…"
            : isBulk
              ? `批量导入 ${bulkCount} 个服务`
              : "保存并探测"}
        </button>
      </div>
    </form>
  );
}

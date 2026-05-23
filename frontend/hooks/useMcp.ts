/**
 * @fileoverview MCP 服务设置页：HTTP/stdio 注册、批量导入、探测刷新与删除。
 */
"use client";

import { useEffect, useState } from "react";
import { API_BASE, apiHeaders, apiJsonHeaders, parseApiError } from "@/lib/api";
import { toast } from "sonner";
import type { McpImportResponse, McpServer } from "@/types/mcp";
import type { McpFormData } from "@/components/settings/mcp/McpAddForm";
import { parseArgsText, parseEnvText } from "@/lib/mcp/parseMcpConfig";

/** 返回空 MCP 添加表单初始值。 */
const emptyForm = (): McpFormData => ({
  name: "",
  transport: "http",
  url: "",
  command: "",
  argsText: "",
  envText: "",
  description: "",
  authToken: "",
  bulkImport: null,
});

/** 管理 MCP 服务器列表、添加表单与工具探测刷新。 */
export function useMcp(token: string | null) {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<McpFormData>(emptyForm());
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>(
    {}
  );

  const fetchServers = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/mcp`, {
        headers: apiHeaders(token),
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      const data = await res.json();
      setServers(data.servers || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchServers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    if (formData.bulkImport && Object.keys(formData.bulkImport).length > 0) {
      setIsSubmitting(true);
      try {
        const res = await fetch(`${API_BASE}/api/mcp/import`, {
          method: "POST",
          headers: apiJsonHeaders(token),
          body: JSON.stringify({ mcpServers: formData.bulkImport }),
        });
        if (!res.ok) throw new Error(await parseApiError(res));
        const data = (await res.json()) as McpImportResponse;
        await fetchServers();
        setShowAddForm(false);
        setFormData(emptyForm());
        const ok = data.imported.length;
        const fail = data.errors.length;
        if (fail > 0) {
          toast.warning(`已导入 ${ok} 个，${fail} 个失败：${data.errors[0]}`);
        } else {
          toast.success(`已批量导入 ${ok} 个 MCP 服务`);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "批量导入失败");
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (!formData.name.trim()) return;

    setIsSubmitting(true);
    try {
      let body: Record<string, unknown>;

      if (formData.transport === "stdio") {
        if (!formData.command.trim()) return;
        const args = parseArgsText(formData.argsText);
        const env = parseEnvText(formData.envText);
        body = {
          name: formData.name.trim(),
          transport: "stdio",
          stdio: {
            command: formData.command.trim(),
            args,
            env,
          },
          description: formData.description.trim(),
          enabled: true,
        };
      } else {
        if (!formData.url.trim()) return;
        const headers: Record<string, string> = {};
        const token_ = formData.authToken.trim();
        if (token_) {
          headers["Authorization"] = token_.startsWith("Bearer ")
            ? token_
            : `Bearer ${token_}`;
        }
        body = {
          name: formData.name.trim(),
          transport: "http",
          url: formData.url.trim(),
          description: formData.description.trim(),
          enabled: true,
          headers,
        };
      }

      const res = await fetch(`${API_BASE}/api/mcp`, {
        method: "POST",
        headers: apiJsonHeaders(token),
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      const added = (await res.json()) as {
        tool_names?: string[];
        last_probe_error?: string | null;
      };
      await fetchServers();
      setShowAddForm(false);
      setFormData(emptyForm());
      const toolCount = added.tool_names?.length ?? 0;
      if (added.last_probe_error) {
        toast.warning(`已保存，但探测异常：${added.last_probe_error}`);
      } else {
        toast.success(`MCP 服务已添加，发现 ${toolCount} 个工具`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "添加失败";
      toast.error(msg.includes("JSON") ? `参数解析失败：${msg}` : msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRefresh = async (id: string) => {
    if (!token || refreshingId) return;
    setRefreshingId(id);
    try {
      const res = await fetch(`${API_BASE}/api/mcp/${id}/refresh`, {
        method: "POST",
        headers: apiHeaders(token),
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      const refreshed = (await res.json()) as {
        tool_names?: string[];
        last_probe_error?: string | null;
      };
      await fetchServers();
      const toolCount = refreshed.tool_names?.length ?? 0;
      if (refreshed.last_probe_error) {
        toast.warning(`刷新完成，但探测异常：${refreshed.last_probe_error}`);
      } else {
        toast.success(`刷新完成，发现 ${toolCount} 个工具`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "刷新失败");
    } finally {
      setRefreshingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!token || !deleteId) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`${API_BASE}/api/mcp/${deleteId}`, {
        method: "DELETE",
        headers: apiHeaders(token),
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      setServers((prev) => prev.filter((s) => s.id !== deleteId));
      setDeleteId(null);
      toast.success("MCP 服务已删除");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除失败");
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleTools = (id: string) => {
    setExpandedTools((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return {
    servers,
    loading,
    error,
    deleteId,
    setDeleteId,
    isDeleting,
    showAddForm,
    setShowAddForm,
    isSubmitting,
    formData,
    setFormData,
    refreshingId,
    expandedTools,
    handleAddSubmit,
    handleRefresh,
    confirmDelete,
    toggleTools,
  };
}

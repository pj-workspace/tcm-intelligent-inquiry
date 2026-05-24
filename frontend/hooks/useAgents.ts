/**
 * @fileoverview Agent 设置页 CRUD：列表、表单、默认 Agent 与工具绑定。
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { API_BASE, apiHeaders, apiJsonHeaders, parseApiError } from "@/lib/api";
import { toast } from "sonner";
import { notifyChatAgentsCatalogChanged } from "@/hooks/useChatAgentsCatalog";
import type { Agent, AgentFormData, GenerateSystemPromptResult, KnowledgeBaseLite } from "@/types/agent";
import type { BuiltinToolInfo } from "@/types/tool";

/**
 * 创建 Agent 时预填的系统提示词模板。
 * 用 `<待填>` / 空白方括号留出关键差异化描述，鼓励用户按场景改写。
 */
export const DEFAULT_SYSTEM_PROMPT = `你是一位 <待填：角色定位，例如「资深中医临床医生」「中医文献研究员」>，专长于 <待填：擅长方向，例如「内科疑难杂症的辨证施治」「经方派理论与临床应用」>。

工作目标：
- <待填：核心目标 1，例如「基于经典文献回答用户的中医问题」>
- <待填：核心目标 2，例如「在涉及方剂时给出组成、功效、主治与常见加减」>

回答规范：
1. 先用一句话概括结论，再展开论证；尽量结构化（要点 / 表格）。
2. 涉及辨证、方剂、药物时优先调用已绑定的检索 / 查询工具核实，避免凭空给方。
3. 引用知识库或网络资料时附上来源（书名 / 篇目 / URL）。
4. 任何处方建议都需提示「学习参考，不能替代执业医师面诊」。

风格偏好：<待填：例如「严谨克制，多用经典文献语汇」「通俗易懂，配合现代医学解释」>。

如用户问题超出能力范围或证据不足，请明确说明并给出进一步检索 / 问诊的建议。`;

const INITIAL_FORM: AgentFormData = {
  name: "",
  description: "",
  system_prompt: DEFAULT_SYSTEM_PROMPT,
  tool_names: [],
  default_kb_id: "",
  user_requirements: "",
};

/** 加载并管理用户 Agent 列表、编辑表单与删除确认。 */
export function useAgents(token: string | null) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [availableTools, setAvailableTools] = useState<string[]>([]);
  const [toolInfos, setToolInfos] = useState<BuiltinToolInfo[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [defaultAgentId, setDefaultAgentId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [formData, setFormData] = useState<AgentFormData>(INITIAL_FORM);

  const fetchData = useCallback(async () => {
    if (!token) return;
    try {
      const [agentsRes, toolsRes, kbRes] = await Promise.all([
        fetch(`${API_BASE}/api/agents`, { headers: apiHeaders(token) }),
        fetch(`${API_BASE}/api/agents/tools`, { headers: apiHeaders(token) }),
        fetch(`${API_BASE}/api/knowledge`, { headers: apiHeaders(token) }),
      ]);
      if (!agentsRes.ok || !toolsRes.ok) throw new Error("获取数据失败");
      const [agentsData, toolsData] = await Promise.all([
        agentsRes.json(),
        toolsRes.json(),
      ]);
      setAgents(agentsData.agents || []);
      // tools 接口返回结构化元数据；同时保留 name 数组兼容旧调用
      const rawTools: BuiltinToolInfo[] = toolsData.tools || [];
      setToolInfos(rawTools);
      setAvailableTools(rawTools.map((t) => t.name));
      if (kbRes.ok) {
        const kbJson = (await kbRes.json()) as {
          knowledge_bases?: { id: string; name: string }[];
        };
        setKnowledgeBases(
          (kbJson.knowledge_bases || []).map((k) => ({ id: k.id, name: k.name }))
        );
      } else {
        setKnowledgeBases([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void fetchData();
    const stored = localStorage.getItem("tcm_default_agent_id");
    if (stored) setDefaultAgentId(stored);
  }, [token, fetchData]);

  const handleSetDefault = (id: string | null) => {
    if (id) {
      localStorage.setItem("tcm_default_agent_id", id);
    } else {
      localStorage.removeItem("tcm_default_agent_id");
    }
    setDefaultAgentId(id);
  };

  const handleStartCreate = () => {
    setEditingId("new");
    setFormData(INITIAL_FORM);
  };

  const handleStartEdit = (agent: Agent) => {
    setEditingId(agent.id);
    setFormData({
      name: agent.name,
      description: agent.description,
      system_prompt: agent.system_prompt,
      tool_names: agent.tool_names,
      default_kb_id: agent.default_kb_id?.trim() || "",
      user_requirements: "",
    });
  };

  const handleStartClone = (agent: Agent) => {
    setEditingId("new");
    setFormData({
      name: `${agent.name} 副本`,
      description: agent.description,
      system_prompt: agent.system_prompt,
      tool_names: [...agent.tool_names],
      default_kb_id: agent.default_kb_id?.trim() || "",
      user_requirements: "",
    });
  };

  const handleCancelEdit = () => setEditingId(null);

  const toggleTool = (toolName: string) => {
    setFormData((prev) => ({
      ...prev,
      tool_names: prev.tool_names.includes(toolName)
        ? prev.tool_names.filter((t) => t !== toolName)
        : [...prev.tool_names, toolName],
    }));
  };

  const handleGenerateSystemPrompt = async () => {
    if (!token || !formData.name.trim()) {
      toast.error("请先填写 Agent 名称");
      return;
    }
    setIsGeneratingPrompt(true);
    try {
      const res = await fetch(`${API_BASE}/api/agents/generate-system-prompt`, {
        method: "POST",
        headers: apiJsonHeaders(token),
        body: JSON.stringify({
          name: formData.name.trim(),
          description: formData.description.trim(),
          default_kb_id: formData.default_kb_id.trim() || null,
          user_requirements: formData.user_requirements.trim() || null,
        }),
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      const data = (await res.json()) as GenerateSystemPromptResult;
      const suggested = data.suggested_tool_names ?? [];
      setFormData((prev) => ({
        ...prev,
        system_prompt: data.system_prompt ?? prev.system_prompt,
        tool_names: suggested.length > 0 ? suggested : prev.tool_names,
      }));
      const hint = data.reasoning?.trim();
      toast.success(
        hint
          ? `已生成提示词并推荐 ${suggested.length} 个工具：${hint}`
          : `已生成提示词并推荐 ${suggested.length} 个工具`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "生成失败");
    } finally {
      setIsGeneratingPrompt(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !formData.name.trim()) return;
    setIsSubmitting(true);
    const isNew = editingId === "new";
    const url = isNew
      ? `${API_BASE}/api/agents`
      : `${API_BASE}/api/agents/${editingId}`;
    const method = isNew ? "POST" : "PATCH";
    try {
      const res = await fetch(url, {
        method,
        headers: apiJsonHeaders(token),
        body: JSON.stringify({
          name: formData.name.trim(),
          description: formData.description.trim(),
          system_prompt: formData.system_prompt.trim(),
          tool_names: formData.tool_names,
          default_kb_id: formData.default_kb_id.trim() || null,
        }),
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      await fetchData();
      notifyChatAgentsCatalogChanged();
      setEditingId(null);
      toast.success(isNew ? "Agent 已创建" : "已保存");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!token || !deleteId) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`${API_BASE}/api/agents/${deleteId}`, {
        method: "DELETE",
        headers: apiHeaders(token),
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      if (defaultAgentId === deleteId) handleSetDefault(null);
      setDeleteId(null);
      await fetchData();
      notifyChatAgentsCatalogChanged();
      toast.success("已删除该 Agent");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除失败");
    } finally {
      setIsDeleting(false);
    }
  };

  return {
    agents,
    availableTools,
    toolInfos,
    knowledgeBases,
    loading,
    error,
    defaultAgentId,
    deleteId,
    setDeleteId,
    isDeleting,
    editingId,
    isSubmitting,
    isGeneratingPrompt,
    formData,
    setFormData,
    handleSetDefault,
    handleStartCreate,
    handleStartEdit,
    handleStartClone,
    handleCancelEdit,
    toggleTool,
    handleSubmit,
    handleGenerateSystemPrompt,
    confirmDelete,
  };
}

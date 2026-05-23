/**
 * @fileoverview Agent 配置域类型：自定义 Agent 实体、表单数据与知识库轻量引用。
 */

/** 服务端持久化的自定义 Agent 配置。 */
export type Agent = {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  tool_names: string[];
  default_kb_id?: string | null;
};

/** 下拉/选择器用的知识库 id + 名称。 */
export type KnowledgeBaseLite = { id: string; name: string };

/** Agent 创建/编辑表单的可编辑字段快照。 */
export type AgentFormData = {
  name: string;
  description: string;
  system_prompt: string;
  tool_names: string[];
  default_kb_id: string;
};

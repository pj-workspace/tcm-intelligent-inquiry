/**
 * @fileoverview 聊天模型目录 API 类型（GET /api/chat/model-options）。
 */

/** 单模型的能力与输入模态描述。 */
export type ModelCapabilities = {
  input?: string[];
  supports_tool_calling?: boolean;
  supports_deep_think?: boolean;
  supports_vision?: boolean;
  vendor_native_online_search?: boolean;
  [key: string]: unknown;
};

/** 目录中的单个可选模型。 */
export type CatalogModelOption = {
  id: string;
  /** 列表简称（不含厂商前缀） */
  label: string;
  /** 完整展示名 / API 原名，用于悬停卡片标题兜底 */
  full_label: string;
  provider_id: string;
  default?: boolean;
  capabilities: ModelCapabilities;
  description: string;
  /** Cursor 风格档位：Fast / Medium / High … */
  speed_tag?: string | null;
  /** 悬停卡片脚注：上下文说明 */
  context_window_hint?: string | null;
};

/** 按厂商分组的模型列表与配置状态。 */
export type ChatProviderGroup = {
  id: string;
  label: string;
  description: string;
  configured: boolean;
  models: CatalogModelOption[];
};

/** GET /api/chat/model-options 完整响应。 */
export type ChatModelCatalogResponse = {
  default_llm_provider: string;
  providers: ChatProviderGroup[];
};

/** @deprecated 请使用 CatalogModelOption */
export type ModelOption = CatalogModelOption;

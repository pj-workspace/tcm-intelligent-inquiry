import type { BrainstormStep } from "@/types/brainstorm";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  type: "message";
  content: string;
  /** 用户消息：多模态 OSS 签名 URL（仅内存与当前会话渲染；过期后历史图可能打不开） */
  imageUrls?: string[];
  /** 助手消息：来自 SSE meta.chatModel */
  modelName?: string;
  /** 助手消息：后端持久化的快速追问话术 */
  followUpSuggestions?: string[];
  /** 助手消息：用户点击终止后标记为 true */
  interrupted?: boolean;
  /** 后端 created_at ISO；用于历史聚合时还原 trace 总时长 */
  createdAt?: string;
};

export type ThinkingStep = Extract<BrainstormStep, { type: "thinking" }>;
export type ToolStep = Extract<BrainstormStep, { type: "tool" }>;
export type InterimTextStep = Extract<BrainstormStep, { type: "interim_text" }>;
export type FlatMessage =
  | ChatMessage
  | ThinkingStep
  | ToolStep
  | InterimTextStep
  | WidgetMessage;

export type TraceMessage = {
  id: string;
  type: "trace";
  steps: BrainstormStep[];
  status: "streaming" | "done";
  totalDurationSec?: number;
  collapsed: boolean;
  /** true：trace 由「用户主动终止 / SSE 错误」收口。footer 显示「已终止」 */
  aborted?: boolean;
  /** true：模型在 think 模式下显式调用了 mark_summary（后端发 summary-start 信号）。
   *  仅此时 footer 显示「✓ 完成」；否则 trace 静默收口、不显示底部完成节点。 */
  summaryAcknowledged?: boolean;
};

/** AI 发送的交互控件（目前仅支持选择框） */
export type WidgetMessage = {
  id: string;
  type: "widget";
  widgetType: "choice";
  question: string;
  choices: string[];
  allowFreeText: boolean;
  /** 用户作答后填入 */
  answer?: string;
  /** 用户点击跳过后为 true */
  dismissed?: boolean;
};

export type Message = ChatMessage | TraceMessage | WidgetMessage;

export type ApiMessageRow = {
  id: string;
  role: string;
  content: string;
  /** 后端 server_default=now() 的 ISO 字符串，前端用于 trace 总时长还原 */
  created_at?: string;
  duration_sec?: number | null;
  model_name?: string | null;
  follow_up_suggestions?: string[] | null;
};

export type GenerationState = "idle" | "waiting" | "thinking" | "tool" | "typing";

export type ServerConversation = {
  id: string;
  title: string;
  created_at?: string;
  /** 服务端分组 id；无则会话在「聊天」未分组 */
  group_id?: string | null;
  agent_id?: string | null;
  agent_name?: string | null;
  last_model_name?: string | null;
};

/** 服务端返回的会话文件夹 */
export type ConversationFolder = {
  id: string;
  name: string;
  sort_order: number;
  created_at?: string;
};

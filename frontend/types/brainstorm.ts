import type { CitationSource } from "@/types/chat";

export type BrainstormStep =
  | {
      id: string;
      type: "thinking";
      content: string;
      durationSec?: number;
      /** 后端 created_at ISO；用于历史聚合时还原 trace 总时长 */
      createdAt?: string;
    }
  | {
      id: string;
      type: "tool";
      toolName: string;
      /** MCP 远端工具原名（SSE / 历史消息提供，优先于解析 LangChain 内部名） */
      mcpRemoteName?: string;
      runId?: string;
      status: "running" | "success" | "error";
      /** true 表示终态由用户主动终止 / 超时收尾产生，区别于业务失败；UI 用「已终止」标签 */
      aborted?: boolean;
      /** 工具入参摘要（SSE tool-call 或历史消息） */
      inputPreview?: string;
      /** 工具返回摘要（SSE tool-result 或历史消息） */
      outputPreview?: string;
      /** 工具返回的结构化引用来源 */
      sources?: CitationSource[];
      createdAt?: string;
    }
  | {
      id: string;
      type: "user_input";
      widgetId: string;
      question: string;
      choices?: string[];
      allowFreeText?: boolean;
      status: "preparing" | "waiting" | "answered" | "dismissed";
      answer?: string;
      createdAt?: string;
    };

export interface BrainstormPanelProps {
  steps: BrainstormStep[];
  isStreaming: boolean;
  durationSec?: number;
  collapsed?: boolean;
  onToggle?: () => void;
  /** 紧跟在助手正文气泡后时使用，减小与上文的空隙 */
  compactTopAfterAssistant?: boolean;
  /** 下一条为助手正文时使用，减小 trace 标题与正文之间的空隙 */
  compactBottomBeforeAssistant?: boolean;
  /** true：trace 由 abort / 错误收口，footer 用「已终止」 */
  aborted?: boolean;
  /** true：模型显式调用了 mark_summary，footer 显示「完成」；否则 trace 不显示 footer */
  summaryAcknowledged?: boolean;
}

export type WebResultItem = {
  title: string;
  url?: string;
  summary?: string;
};

export type EdgeFadeState = { top: boolean; bottom: boolean };

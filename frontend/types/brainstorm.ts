export type BrainstormStep =
  | {
      id: string;
      type: "thinking";
      content: string;
      durationSec?: number;
    }
  | {
      id: string;
      type: "tool";
      toolName: string;
      /** MCP 远端工具原名（SSE / 历史消息提供，优先于解析 LangChain 内部名） */
      mcpRemoteName?: string;
      runId?: string;
      status: "running" | "success" | "error";
      /** 工具入参摘要（SSE tool-call 或历史消息） */
      inputPreview?: string;
      /** 工具返回摘要（SSE tool-result 或历史消息） */
      outputPreview?: string;
    };

export interface BrainstormPanelProps {
  steps: BrainstormStep[];
  isStreaming: boolean;
  durationSec?: number;
  collapsed?: boolean;
  onToggle?: () => void;
  /** 紧跟在助手正文气泡后时使用，减小与上文的空隙 */
  compactTopAfterAssistant?: boolean;
}

export type WebResultItem = {
  title: string;
  url?: string;
  summary?: string;
};

export type EdgeFadeState = { top: boolean; bottom: boolean };

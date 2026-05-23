/**
 * @fileoverview SSE data 行解析（与 doc/frontend-integration.md D.3 及后端 streaming 对齐）。
 *
 * 引用相关事件：
 * - ``tool-result.sources``：自上次工具以来**增量**新登记来源
 * - ``source-registry``：本轮**全量**已登记来源，供 assistant 气泡挂载 citations
 */

/** 后端 streaming 协议已知 SSE `type` 枚举（与 doc/frontend-integration.md D.3 对齐）。 */
export const KNOWN_SSE_EVENT_TYPES = [
  "notice",
  "meta",
  "text-delta",
  "thinking-delta",
  "ask-user-start",
  "tool-call",
  "tool-result",
  "source-registry",
  "summary-start",
  "widget",
  "title-updated",
  "llm-usage",
  "error",
] as const;

/** `KNOWN_SSE_EVENT_TYPES` 的元素类型。 */
export type KnownSseEventType = (typeof KNOWN_SSE_EVENT_TYPES)[number];

/** 单行 SSE data 解析结果：完成标记、JSON 对象或无效。 */
export type ParsedSseDataLine =
  | { kind: "done" }
  | { kind: "json"; data: Record<string, unknown> }
  | { kind: "invalid" };

/** 从 `data: ` 行内容解析（不含前缀）。 */
export function parseSseDataLine(dataStr: string): ParsedSseDataLine {
  const trimmed = dataStr.trim();
  if (trimmed === "[DONE]") {
    return { kind: "done" };
  }
  try {
    const data = JSON.parse(trimmed) as unknown;
    if (typeof data === "object" && data !== null && !Array.isArray(data)) {
      return { kind: "json", data: data as Record<string, unknown> };
    }
    return { kind: "invalid" };
  } catch {
    return { kind: "invalid" };
  }
}

/** 从已解析 JSON 对象提取 `type` 字段。 */
export function sseEventType(
  data: Record<string, unknown>,
): string | undefined {
  return typeof data.type === "string" ? data.type : undefined;
}

/** 类型守卫：判断字符串是否为已知 SSE 事件类型。 */
export function isKnownSseEventType(
  type: string,
): type is KnownSseEventType {
  return (KNOWN_SSE_EVENT_TYPES as readonly string[]).includes(type);
}

/** 将 SSE 帧缓冲按 `\\n\\n` 切分并解析各 data 行。 */
export function parseSseFrameBuffer(buffer: string): {
  remainder: string;
  events: ParsedSseDataLine[];
} {
  const parts = buffer.split("\n\n");
  const remainder = parts.pop() ?? "";
  const events: ParsedSseDataLine[] = [];
  for (const frame of parts) {
    for (const line of frame.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      events.push(parseSseDataLine(line.slice(6)));
    }
  }
  return { remainder, events };
}

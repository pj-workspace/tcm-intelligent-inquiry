/** 从正文移除已闭合的 `json-report` 代码块（兼容历史会话中的机器输出）。 */
export function stripJsonReportBlocks(md: string): string {
  return md.replace(/```json-report\s*\r?\n([\s\S]*?)```/g, '').trimEnd()
}

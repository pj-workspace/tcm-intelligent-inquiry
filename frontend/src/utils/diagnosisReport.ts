import type { TcmDiagnosisReport } from '@/types/consultation'

const JSON_REPORT_FENCE =
  /```json-report\s*\r?\n([\s\S]*?)```/g

/** 从正文移除已闭合的 `json-report` 代码块（避免卡片与代码块重复展示）。 */
export function stripJsonReportBlocks(md: string): string {
  return md
    .replace(JSON_REPORT_FENCE, '')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()
}

/** 历史记录等场景：从助手全文解析结构化报告；JSON 损坏时返回 null。 */
export function tryParseDiagnosisReportFromMarkdown(
  md: string
): TcmDiagnosisReport | null {
  const re = /```json-report\s*\r?\n([\s\S]*?)```/
  const m = md.match(re)
  if (!m?.[1]) return null
  try {
    const o = JSON.parse(m[1].trim()) as Record<string, unknown>
    return normalizeReportPayload(o)
  } catch {
    return null
  }
}

/** SSE `report` 事件载荷规范化。 */
export function normalizeReportPayload(
  o: Record<string, unknown>
): TcmDiagnosisReport {
  return {
    pattern: typeof o.pattern === 'string' ? o.pattern : '',
    reasoning: typeof o.reasoning === 'string' ? o.reasoning : '',
    formula:
      o.formula == null
        ? null
        : typeof o.formula === 'string'
          ? o.formula
          : String(o.formula),
    herbs: Array.isArray(o.herbs)
      ? o.herbs.filter((x): x is string => typeof x === 'string')
      : [],
    lifestyle: Array.isArray(o.lifestyle)
      ? o.lifestyle.filter((x): x is string => typeof x === 'string')
      : [],
  }
}

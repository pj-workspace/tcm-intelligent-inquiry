import type { HerbSafetyCheckResult, TcmDiagnosisReport } from '@/types/consultation'

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

export function normalizeSafetyPayload(o: unknown): HerbSafetyCheckResult | null {
  if (o == null || typeof o !== 'object' || Array.isArray(o)) return null
  const s = o as Record<string, unknown>
  if (typeof s.safe !== 'boolean') return null
  const warnings = Array.isArray(s.warnings)
    ? s.warnings.filter((x): x is string => typeof x === 'string')
    : []
  return { safe: s.safe, warnings }
}

/**
 * 解析 SSE {@code report}：新格式 {@code { report, safety }} 或兼容旧版「扁平」仅报告字段。
 */
export function parseConsultationReportSsePayload(data: string): {
  report: TcmDiagnosisReport
  safety: HerbSafetyCheckResult | null
} | null {
  try {
    const o = JSON.parse(data) as Record<string, unknown>
    const nested = o.report
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      return {
        report: normalizeReportPayload(nested as Record<string, unknown>),
        safety: normalizeSafetyPayload(o.safety),
      }
    }
    return {
      report: normalizeReportPayload(o),
      safety: normalizeSafetyPayload(o.safety),
    }
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

/**
 * 问诊页「模型 / RAG / 文献检索」数值偏好：与 ChatView 中 input、el-slider 的 min/max 保持一致，
 * 便于从 localStorage 恢复时做边界收敛，避免脏数据导致请求异常。
 */
export type ConsultModelPrefs = {
  temperature: number
  topP: number
  maxHistoryTurns: number
  ragTopK: number
  ragSimilarityThreshold: number
  literatureTopK: number
  literatureThreshold: number
}

export const DEFAULT_CONSULT_MODEL_PREFS: ConsultModelPrefs = {
  temperature: 0.7,
  topP: 0.9,
  maxHistoryTurns: 10,
  ragTopK: 4,
  ragSimilarityThreshold: 0,
  literatureTopK: 4,
  literatureThreshold: 0,
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

/**
 * 将任意 JSON 反序列化结果收敛为合法偏好对象（缺项用默认值，越界则钳制）。
 */
export function normalizeConsultModelPrefs(raw: unknown): ConsultModelPrefs {
  const d = DEFAULT_CONSULT_MODEL_PREFS
  if (!raw || typeof raw !== 'object') return { ...d }
  const o = raw as Record<string, unknown>
  return {
    temperature: Math.min(2, Math.max(0, num(o.temperature, d.temperature))),
    topP: Math.min(1, Math.max(0.05, num(o.topP, d.topP))),
    maxHistoryTurns: Math.min(
      50,
      Math.max(1, Math.round(num(o.maxHistoryTurns, d.maxHistoryTurns)))
    ),
    ragTopK: Math.min(
      20,
      Math.max(1, Math.round(num(o.ragTopK, d.ragTopK)))
    ),
    ragSimilarityThreshold: Math.min(
      1,
      Math.max(0, num(o.ragSimilarityThreshold, d.ragSimilarityThreshold))
    ),
    literatureTopK: Math.min(
      20,
      Math.max(1, Math.round(num(o.literatureTopK, d.literatureTopK)))
    ),
    literatureThreshold: Math.min(
      1,
      Math.max(0, num(o.literatureThreshold, d.literatureThreshold))
    ),
  }
}

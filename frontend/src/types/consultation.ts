import type { KnowledgeRetrievedPassage } from '@/types/knowledge'

/** 问诊会话列表项（与后端 ChatSessionResponse 一致）。 */
export type ChatSessionInfo = {
  id: number
  title: string
  createdAt: string
  updatedAt: string
}

/** 与后端 {@code TcmDiagnosisReport} 一致的结构化辨证摘要。 */
export type TcmDiagnosisReport = {
  pattern: string
  reasoning: string
  formula: string | null
  herbs: string[]
  lifestyle: string[]
}

/** 与后端 {@code HerbSafetyCheckResult} 一致的配伍禁忌扫描结果。 */
export type HerbSafetyCheckResult = {
  safe: boolean
  warnings: string[]
}

/** 与会话中单轮问答对应的只读结构（与后端 ChatMessageView 一致）。 */
export type ChatMessageView = {
  id: number
  userMessage: string
  assistantMessage: string
  modelName: string | null
  temperature: number | null
  createdAt: string
  /** RAG 溯源摘录（与 SSE meta.passages 对齐） */
  retrievalPassages?: KnowledgeRetrievedPassage[]
}

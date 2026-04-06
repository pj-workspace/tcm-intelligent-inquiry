/** 后端 KnowledgeBase 主要字段 */
export type KnowledgeBase = {
  id: number
  name: string
  vectorBackend: string
  embeddingModelName: string
  createdAt: string
}

/** 与后端 IngestionStatus 对齐 */
export type KnowledgeIngestionStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'

/** 仍处于异步流水线、需要列表轮询的状态 */
export const KNOWLEDGE_INGEST_IN_FLIGHT_STATUSES: readonly KnowledgeIngestionStatus[] = [
  'PENDING',
  'PROCESSING',
]

export type KnowledgeFileView = {
  id: number
  originalFilename: string
  fileUuid: string
  sizeBytes: number
  contentType: string | null
  /** 已向量化分块数；排队/处理中/旧数据可能为 null */
  embedChunkCount: number | null
  createdAt: string
  status: KnowledgeIngestionStatus
  errorMessage: string | null
}

export function knowledgeFilesNeedPoll(files: readonly KnowledgeFileView[]): boolean {
  return files.some((f) => KNOWLEDGE_INGEST_IN_FLIGHT_STATUSES.includes(f.status))
}

/** 与后端 KnowledgeRetrievalMatchType 序列化值对齐 */
export type KnowledgeRetrievalMatchTypeWire = 'semantic' | 'keyword' | 'hybrid'

export type KnowledgeRetrievedPassage = {
  index: number
  documentId: string
  source: string
  matchType: KnowledgeRetrievalMatchTypeWire
  score: number
  /** 摘录正文（与后端 meta / 落库一致） */
  excerpt?: string
  /** knowledge | literature */
  channel?: string
}

export type KnowledgeQueryResponse = {
  answer: string
  sources: string[]
  retrievedChunks: number
  /** 混合检索返回的逐条元数据（旧后端可能为空数组） */
  passages?: KnowledgeRetrievedPassage[]
}

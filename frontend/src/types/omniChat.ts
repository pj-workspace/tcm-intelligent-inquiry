/** 统一问诊入口：会话能力模式（与后台路由对应）。 */
export type OmniChatMode = 'standard' | 'knowledge' | 'literature' | 'vision'

export type OmniSendPayload = {
  mode: OmniChatMode
  knowledgeBaseId: number | null
  /** 临时文献库 ID；空或未选则不发。 */
  literatureCollectionId: string | null
  visionUseKb: boolean
  visionKbId: number | null
  literatureTopK: number
  literatureThreshold: number
  visionImage: File | null
  temperature: number
  maxHistoryTurns: number
  ragTopK: number
  ragSimilarityThreshold: number
  scrollRoot: HTMLElement | null
  /** 为 true 时不向列表追加用户气泡（用于「重新生成」沿用上一轮提问） */
  skipAppendUser?: boolean
}

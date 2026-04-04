export interface AgentRunResponse {
  assistant: string
  knowledgeSources: string[]
  /** 如 react+tools：后端 ReAct 工具编排模式 */
  mode: string
  /** 预留：服务端工具调用摘要（当前多为空数组） */
  toolCallSummaries?: string[]
}

/** GET/PUT /v1/agent/config */
export interface AgentConfigView {
  displayName: string
  textSystemPrompt: string | null
  visionSystemPrompt: string | null
  visionModelName: string | null
  defaultKnowledgeBaseId: number | null
  updatedAt: string
}

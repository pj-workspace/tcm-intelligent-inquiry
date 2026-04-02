/** 问诊会话列表项（与后端 ChatSessionResponse 一致）。 */
export type ChatSessionInfo = {
  id: number
  title: string
  createdAt: string
  updatedAt: string
}

/** 与会话中单轮问答对应的只读结构（与后端 ChatMessageView 一致）。 */
export type ChatMessageView = {
  id: number
  userMessage: string
  assistantMessage: string
  modelName: string | null
  temperature: number | null
  createdAt: string
}

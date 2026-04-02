import { apiClient } from '@/api/core/client'
import type { ApiResult } from '@/types/api'
import type { ChatMessageView, ChatSessionInfo } from '@/types/consultation'

/** 问诊 SSE 聊天（完整 URL，供 fetch 使用）。 */
export const CONSULTATION_CHAT_STREAM_URL = '/api/v1/consultation/chat'

export function getConsultationHealth() {
  return apiClient.get<ApiResult<string>>('/v1/consultation/health')
}

export function listConsultationSessions() {
  return apiClient.get<ApiResult<ChatSessionInfo[]>>('/v1/consultation/sessions')
}

export function createConsultationSession() {
  return apiClient.post<ApiResult<ChatSessionInfo>>('/v1/consultation/sessions', {})
}

export function listConsultationMessages(sessionId: number) {
  return apiClient.get<ApiResult<ChatMessageView[]>>(
    `/v1/consultation/sessions/${sessionId}/messages`
  )
}

export function deleteConsultationSession(sessionId: number) {
  return apiClient.delete<ApiResult<unknown>>(
    `/v1/consultation/sessions/${sessionId}`
  )
}

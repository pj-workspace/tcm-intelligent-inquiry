import { apiClient } from '@/api/core/client'
import type { ApiResult } from '@/types/api'
import type { AgentConfigView, AgentRunResponse } from '@/types/agent'

export function getAgentHealth() {
  return apiClient.get<ApiResult<string>>('/v1/agent/health')
}

export function getAgentConfig() {
  return apiClient.get<ApiResult<AgentConfigView>>('/v1/agent/config')
}

export function updateAgentConfig(body: {
  displayName: string
  textSystemPrompt: string | null
  visionSystemPrompt: string | null
  visionModelName: string | null
  defaultKnowledgeBaseId: number | null
}) {
  return apiClient.put<ApiResult<AgentConfigView>>('/v1/agent/config', body)
}

export function postAgentRunJson(body: Record<string, unknown>) {
  return apiClient.post<ApiResult<AgentRunResponse>>('/v1/agent/run', body)
}

export function postAgentRunMultipart(formData: FormData) {
  return apiClient.post<ApiResult<AgentRunResponse>>('/v1/agent/run', formData)
}

import { apiClient } from '@/api/core/client'
import type { ApiResult } from '@/types/api'
import type { KnowledgeBase, KnowledgeFileView } from '@/types/knowledge'

export function getKnowledgeHealth() {
  return apiClient.get<ApiResult<string>>('/v1/knowledge/health')
}

export function listKnowledgeBases() {
  return apiClient.get<ApiResult<KnowledgeBase[]>>('/v1/knowledge/bases')
}

export function createKnowledgeBase(body: {
  name: string
  embeddingModel: string
}) {
  return apiClient.post<ApiResult<KnowledgeBase>>('/v1/knowledge/bases', body)
}

export function listKnowledgeDocuments(knowledgeBaseId: number) {
  return apiClient.get<ApiResult<KnowledgeFileView[]>>(
    `/v1/knowledge/bases/${knowledgeBaseId}/documents`
  )
}

export function uploadKnowledgeDocument(
  knowledgeBaseId: number,
  formData: FormData
) {
  return apiClient.post<ApiResult<KnowledgeFileView>>(
    `/v1/knowledge/bases/${knowledgeBaseId}/documents`,
    formData
  )
}

export function deleteKnowledgeDocument(
  knowledgeBaseId: number,
  fileUuid: string
) {
  return apiClient.delete<ApiResult<unknown>>(
    `/v1/knowledge/bases/${knowledgeBaseId}/documents/${fileUuid}`
  )
}

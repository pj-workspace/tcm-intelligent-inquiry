import type { AxiosRequestConfig } from 'axios'

import { apiClient } from '@/api/core/client'
import type { ApiResult } from '@/types/api'
import type {
  KnowledgeBase,
  KnowledgeFileView,
  KnowledgeQueryResponse,
} from '@/types/knowledge'

export function getKnowledgeHealth(config?: AxiosRequestConfig) {
  return apiClient.get<ApiResult<string>>('/v1/knowledge/health', config)
}

export function listKnowledgeBases(config?: AxiosRequestConfig) {
  return apiClient.get<ApiResult<KnowledgeBase[]>>('/v1/knowledge/bases', config)
}

export function createKnowledgeBase(
  body: { name: string; embeddingModel: string },
  config?: AxiosRequestConfig
) {
  return apiClient.post<ApiResult<KnowledgeBase>>('/v1/knowledge/bases', body, config)
}

export function listKnowledgeDocuments(
  knowledgeBaseId: number,
  config?: AxiosRequestConfig
) {
  return apiClient.get<ApiResult<KnowledgeFileView[]>>(
    `/v1/knowledge/bases/${knowledgeBaseId}/documents`,
    config
  )
}

export function uploadKnowledgeDocument(
  knowledgeBaseId: number,
  formData: FormData,
  config?: AxiosRequestConfig
) {
  return apiClient.post<ApiResult<KnowledgeFileView>>(
    `/v1/knowledge/bases/${knowledgeBaseId}/documents`,
    formData,
    config
  )
}

export function deleteKnowledgeDocument(
  knowledgeBaseId: number,
  fileUuid: string,
  config?: AxiosRequestConfig
) {
  return apiClient.delete<ApiResult<unknown>>(
    `/v1/knowledge/bases/${knowledgeBaseId}/documents/${fileUuid}`,
    config
  )
}

/** 单次 RAG 问答（非 SSE），与问诊知识库模式同源检索逻辑，供管理页快速验库。 */
export function queryKnowledgeBase(
  knowledgeBaseId: number,
  body: {
    message: string
    topK?: number
    similarityThreshold?: number
  },
  config?: AxiosRequestConfig
) {
  return apiClient.post<ApiResult<KnowledgeQueryResponse>>(
    `/v1/knowledge/bases/${knowledgeBaseId}/query`,
    body,
    config
  )
}

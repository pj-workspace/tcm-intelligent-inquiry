import { apiClient } from '@/api/core/client'
import type { ApiResult } from '@/types/api'
import type { LiteratureFileView } from '@/types/literature'

export function getLiteratureHealth() {
  return apiClient.get<ApiResult<string>>('/v1/literature/health')
}

export function listLiteratureCollectionFiles(collectionId: string) {
  return apiClient.get<ApiResult<LiteratureFileView[]>>(
    `/v1/literature/collections/${encodeURIComponent(collectionId)}/files`
  )
}

export function uploadLiteratureFile(formData: FormData) {
  return apiClient.post<ApiResult<LiteratureFileView>>(
    '/v1/literature/uploads',
    formData
  )
}

export function deleteLiteratureDocument(collectionId: string, fileUuid: string) {
  return apiClient.delete(
    `/v1/literature/collections/${encodeURIComponent(collectionId)}/documents/${encodeURIComponent(fileUuid)}`
  )
}

export function deleteLiteratureCollection(collectionId: string) {
  return apiClient.delete(
    `/v1/literature/collections/${encodeURIComponent(collectionId)}`
  )
}

export function listLiteratureUploads() {
  return apiClient.get<ApiResult<LiteratureFileView[]>>('/v1/literature/uploads')
}

export type LiteratureUploadStatus = 'PENDING' | 'READY' | 'FAILED'

export interface LiteratureFileView {
  id: number
  tempCollectionId: string
  originalFilename: string
  fileUuid: string
  sizeBytes: number
  contentType: string
  status: LiteratureUploadStatus
  createdAt: string
  /** ISO-8601；临时库统一过期时刻，每次上传同库会顺延 */
  expiresAt?: string | null
  /** 失败原因（若后端扩展返回） */
  errorMessage?: string | null
}

/** 文献异步入库进行中（当前后端仅 PENDING 表示未完成） */
export function literatureFilesNeedPoll(files: readonly LiteratureFileView[]): boolean {
  return files.some((f) => f.status === 'PENDING')
}

export interface LiteratureQueryResponse {
  answer: string
  sources: string[]
  retrievedChunks: number
}

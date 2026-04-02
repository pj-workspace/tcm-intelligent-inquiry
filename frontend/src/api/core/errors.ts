import type { ApiResult } from '@/types/api'

export const MSG_NETWORK = '网络异常，请检查连接后重试'
export const MSG_SERVER = '服务暂时不可用，请稍后重试'
export const MSG_TIMEOUT = '请求超时，请稍后重试'

/** 业务 code≠0 或 axios 层统一映射后的错误 */
export class ApiBusinessError extends Error {
  readonly code: number
  readonly httpStatus?: number

  constructor(message: string, code: number, httpStatus?: number) {
    super(message)
    this.name = 'ApiBusinessError'
    this.code = code
    this.httpStatus = httpStatus
  }
}

export function isApiResultBody(value: unknown): value is ApiResult<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    typeof (value as ApiResult<unknown>).code === 'number'
  )
}

/** 供 catch 块与 UI 展示 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiBusinessError) return error.message
  if (error instanceof Error) return error.message
  return String(error)
}

/** 与 SSE 非 2xx 响应文案对齐（避免泄露长 body） */
export function formatStreamHttpError(
  status: number,
  statusText: string,
  bodySnippet: string
): string {
  if (status >= 500) {
    return MSG_SERVER
  }
  const head = `流式请求失败（${status} ${statusText || ''}）`.trim()
  if (!bodySnippet) return head
  return `${head} ${bodySnippet.slice(0, 500)}`
}

import { formatStreamHttpError } from './errors'

export interface SseStreamOptions {
  method?: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: BodyInit | null
  signal?: AbortSignal
  /** 收到命名事件时回调（如 event: error） */
  onNamedEvent?: (eventName: string, data: string) => void
}

/**
 * 使用 fetch 建立 SSE（text/event-stream）连接，逐行解析 data: 负载。
 * 适用于后端聊天等流式接口。
 */
export async function openSseStream(
  url: string,
  onChunk: (data: string) => void,
  options: SseStreamOptions = {}
): Promise<void> {
  const { method = 'GET', headers = {}, body, signal, onNamedEvent } = options
  const res = await fetch(url, {
    method,
    headers: {
      Accept: 'text/event-stream',
      ...headers,
    },
    body: method === 'POST' ? body : undefined,
    signal,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(formatStreamHttpError(res.status, res.statusText, text))
  }
  if (!res.body) {
    throw new Error('流式响应无内容，请稍后重试')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let currentEvent = 'message'

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trimEnd()
        if (trimmed === '') continue
        if (trimmed.startsWith('event:')) {
          currentEvent = trimmed.slice(6).trim() || 'message'
          continue
        }
        if (!trimmed.startsWith('data:')) continue
        const payload = trimmed.slice(5).trimStart()
        if (payload === '[DONE]') return

        if (currentEvent === 'error') {
          onNamedEvent?.('error', payload)
          throw new Error(payload)
        }
        if (currentEvent !== 'message') {
          onNamedEvent?.(currentEvent, payload)
          currentEvent = 'message'
          continue
        }
        onChunk(payload)
      }
    }
  } finally {
    reader.releaseLock()
  }
}

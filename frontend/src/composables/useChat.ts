import { ref, nextTick } from 'vue'
import { getErrorMessage } from '@/api/core/errors'
import { openSseStream } from '@/api/core/sse'
import {
  CONSULTATION_CHAT_STREAM_URL,
  createConsultationSession,
  deleteConsultationSession,
  listConsultationMessages,
  listConsultationSessions,
} from '@/api/modules/consultation'
import { postAgentRunJson, postAgentRunMultipart } from '@/api/modules/agent'
import type { AgentRunResponse } from '@/types/agent'
import type { ApiResult } from '@/types/api'
import type { ChatSessionInfo } from '@/types/consultation'
import type { OmniSendPayload } from '@/types/omniChat'

export type ChatTurn = { role: 'user' | 'assistant'; content: string }

/** 兼容旧路径：`import type { ChatSessionInfo } from '@/composables/useChat'` */
export type { ChatSessionInfo }

/** localStorage 键：刷新后恢复上次打开的问诊会话。 */
export const CONSULTATION_LAST_SESSION_KEY = 'tcm-consultation-last-session-id'

export type SendOptions = {
  temperature?: number
  maxHistoryTurns?: number
  scrollRoot?: HTMLElement | null
  /** 可选：问诊时检索该知识库摘录注入模型（与智能体 RAG 同源）。 */
  knowledgeBaseId?: number | null
  ragTopK?: number | null
  ragSimilarityThreshold?: number | null
  /** 临时文献库 ID；与 knowledgeBaseId 互斥，走问诊同一 SSE。 */
  literatureCollectionId?: string | null
  literatureRagTopK?: number | null
  literatureSimilarityThreshold?: number | null
  /** 不向消息列表追加用户条目（重新生成上一答时，列表末尾已是用户） */
  skipAppendUser?: boolean
}

/** 问诊流式接口首包 {@code event: meta}（知识库或文献 RAG）。 */
export type ConsultationRagMeta = {
  sources: string[]
  retrievedChunks: number
  knowledgeBaseId?: number
  literatureCollectionId?: string
}

/**
 * 中医问诊：会话列表、历史加载、SSE 流式发送、打字机状态与错误处理。
 */
export function useChat() {
  const sessions = ref<ChatSessionInfo[]>([])
  const sessionId = ref<number | null>(null)
  const messages = ref<ChatTurn[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  /** 当前一轮助手流式累积（完成后会并入 messages） */
  const streamingContent = ref('')
  /** 当前回合知识库检索摘要（仅当本轮请求携带 knowledgeBaseId 且收到 meta 时有效） */
  const ragMeta = ref<ConsultationRagMeta | null>(null)
  let abort: AbortController | null = null

  function persistLastSession(id: number | null) {
    if (id == null) localStorage.removeItem(CONSULTATION_LAST_SESSION_KEY)
    else localStorage.setItem(CONSULTATION_LAST_SESSION_KEY, String(id))
  }

  async function fetchSessions() {
    const { data } = await listConsultationSessions()
    if (data.code !== 0) {
      throw new Error(data.message || '加载会话列表失败')
    }
    sessions.value = data.data ?? []
  }

  async function ensureSession() {
    if (sessionId.value != null) return
    const { data } = await createConsultationSession()
    if (data.code !== 0 || !data.data) {
      throw new Error(data.message || '创建会话失败')
    }
    sessionId.value = data.data.id
  }

  async function loadHistory() {
    if (sessionId.value == null) return
    const { data } = await listConsultationMessages(sessionId.value)
    if (data.code !== 0) {
      throw new Error(data.message || '加载历史失败')
    }
    const list = data.data ?? []
    const next: ChatTurn[] = []
    for (const m of list) {
      next.push({ role: 'user', content: m.userMessage })
      next.push({ role: 'assistant', content: m.assistantMessage })
    }
    messages.value = next
  }

  async function openSession(id: number) {
    stop()
    error.value = null
    streamingContent.value = ''
    ragMeta.value = null
    sessionId.value = id
    try {
      await loadHistory()
    } catch (e) {
      sessionId.value = null
      throw e
    }
    persistLastSession(id)
  }

  async function newSession() {
    stop()
    sessionId.value = null
    messages.value = []
    streamingContent.value = ''
    ragMeta.value = null
    error.value = null
    await ensureSession()
    if (sessionId.value != null) persistLastSession(sessionId.value)
    await fetchSessions()
  }

  async function deleteSession(id: number) {
    await deleteConsultationSession(id)
    await fetchSessions()
    if (sessionId.value === id) {
      const next = sessions.value[0]
      if (next) {
        await openSession(next.id)
      } else {
        persistLastSession(null)
        await newSession()
      }
    }
  }

  function scrollToBottom(el: HTMLElement | null) {
    if (!el) return
    nextTick(() => {
      el.scrollTop = el.scrollHeight
    })
  }

  async function send(userText: string, opts?: SendOptions) {
    const text = userText.trim()
    if (!text || loading.value) return

    await ensureSession()
    if (sessionId.value == null) throw new Error('无会话')

    error.value = null
    ragMeta.value = null
    if (!opts?.skipAppendUser) {
      messages.value = [...messages.value, { role: 'user', content: text }]
    }
    streamingContent.value = ''
    loading.value = true
    abort = new AbortController()

    const body: Record<string, unknown> = {
      sessionId: sessionId.value,
      message: text,
      temperature: opts?.temperature,
      maxHistoryTurns: opts?.maxHistoryTurns,
    }
    if (opts?.knowledgeBaseId != null) {
      body.knowledgeBaseId = opts.knowledgeBaseId
      if (opts.ragTopK != null) body.ragTopK = opts.ragTopK
      if (opts.ragSimilarityThreshold != null) {
        body.ragSimilarityThreshold = opts.ragSimilarityThreshold
      }
    }
    if (
      opts?.literatureCollectionId != null &&
      opts.literatureCollectionId !== ''
    ) {
      body.literatureCollectionId = opts.literatureCollectionId
      if (opts.literatureRagTopK != null) {
        body.literatureRagTopK = opts.literatureRagTopK
      }
      if (opts.literatureSimilarityThreshold != null) {
        body.literatureSimilarityThreshold = opts.literatureSimilarityThreshold
      }
    }

    let assistant = ''
    const kbIdForMeta = opts?.knowledgeBaseId ?? null
    const litIdForMeta = opts?.literatureCollectionId ?? null
    try {
      await openSseStream(
        CONSULTATION_CHAT_STREAM_URL,
        (chunk) => {
          if (chunk === '[DONE]') return
          assistant += chunk
          streamingContent.value = assistant
          scrollToBottom(opts?.scrollRoot ?? null)
        },
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: abort.signal,
          onNamedEvent: (name, data) => {
            if (name !== 'meta') return
            try {
              const o = JSON.parse(data) as Record<string, unknown>
              const sources = Array.isArray(o.sources)
                ? (o.sources as string[])
                : []
              const retrievedChunks =
                typeof o.retrievedChunks === 'number' ? o.retrievedChunks : 0
              const knowledgeBaseId =
                typeof o.knowledgeBaseId === 'number'
                  ? o.knowledgeBaseId
                  : kbIdForMeta ?? undefined
              const literatureCollectionId =
                typeof o.literatureCollectionId === 'string'
                  ? o.literatureCollectionId
                  : litIdForMeta && litIdForMeta !== ''
                    ? litIdForMeta
                    : undefined
              ragMeta.value = {
                sources,
                retrievedChunks,
                knowledgeBaseId,
                literatureCollectionId,
              }
            } catch {
              /* ignore */
            }
          },
        }
      )
      messages.value = [
        ...messages.value,
        { role: 'assistant', content: assistant },
      ]
      streamingContent.value = ''
      await fetchSessions()
    } catch (e: unknown) {
      if ((e as Error)?.name === 'AbortError') {
        error.value = '已停止生成'
        if (assistant) {
          messages.value = [
            ...messages.value,
            { role: 'assistant', content: assistant + '\n…（已中断）' },
          ]
        } else if (!opts?.skipAppendUser) {
          messages.value = messages.value.slice(0, -1)
        }
      } else {
        error.value = getErrorMessage(e)
        if (!opts?.skipAppendUser) {
          messages.value = messages.value.slice(0, -1)
        }
      }
      streamingContent.value = ''
    } finally {
      loading.value = false
      abort = null
      scrollToBottom(opts?.scrollRoot ?? null)
    }
  }

  function stop() {
    abort?.abort()
  }

  /**
   * 视觉智能体：POST /v1/agent/run（多模态或纯文本），非 SSE；回复写入本会话消息列表。
   */
  async function sendVisionAgent(
    userText: string,
    image: File | null,
    opts?: Pick<
      SendOptions,
      | 'scrollRoot'
      | 'knowledgeBaseId'
      | 'ragTopK'
      | 'ragSimilarityThreshold'
      | 'skipAppendUser'
    >
  ) {
    const text = userText.trim()
    if (!text || loading.value) return

    await ensureSession()
    if (sessionId.value == null) throw new Error('无会话')

    error.value = null
    ragMeta.value = null
    const userLabel =
      image != null ? `${text}\n\n（附图：${image.name}）` : text
    if (!opts?.skipAppendUser) {
      messages.value = [...messages.value, { role: 'user', content: userLabel }]
    }
    streamingContent.value = ''
    loading.value = true

    try {
      let data: ApiResult<AgentRunResponse>
      if (image != null) {
        const fd = new FormData()
        fd.append('task', text)
        fd.append('image', image)
        const kb = opts?.knowledgeBaseId
        if (kb != null) {
          fd.append('knowledgeBaseId', String(kb))
          if (opts?.ragTopK != null) {
            fd.append('ragTopK', String(opts.ragTopK))
          }
          if (opts?.ragSimilarityThreshold != null) {
            fd.append(
              'ragSimilarityThreshold',
              String(opts.ragSimilarityThreshold)
            )
          }
        }
        const res = await postAgentRunMultipart(fd)
        data = res.data
      } else {
        const body: Record<string, unknown> = { task: text }
        const kb = opts?.knowledgeBaseId
        if (kb != null) {
          body.knowledgeBaseId = kb
          if (opts?.ragTopK != null) body.ragTopK = opts.ragTopK
          if (opts?.ragSimilarityThreshold != null) {
            body.ragSimilarityThreshold = opts.ragSimilarityThreshold
          }
        }
        const res = await postAgentRunJson(body)
        data = res.data
      }
      if (data.code !== 0) throw new Error(data.message || '智能体调用失败')
      const answer = data.data?.assistant ?? ''
      const sources = data.data?.knowledgeSources ?? []
      const kbMeta = opts?.knowledgeBaseId
      if (kbMeta != null && sources.length > 0) {
        ragMeta.value = {
          sources,
          retrievedChunks: sources.length,
          knowledgeBaseId: kbMeta,
        }
      }
      messages.value = [
        ...messages.value,
        { role: 'assistant', content: answer },
      ]
      await fetchSessions()
    } catch (e: unknown) {
      error.value = getErrorMessage(e)
      if (!opts?.skipAppendUser) {
        messages.value = messages.value.slice(0, -1)
      }
    } finally {
      loading.value = false
      scrollToBottom(opts?.scrollRoot ?? null)
    }
  }

  async function sendOmni(userText: string, p: OmniSendPayload) {
    const skip = p.skipAppendUser === true
    if (p.mode === 'vision') {
      const kb =
        p.visionUseKb && p.visionKbId != null ? p.visionKbId : null
      const img = p.visionImage
      return sendVisionAgent(userText, img, {
        scrollRoot: p.scrollRoot,
        knowledgeBaseId: kb,
        ragTopK: p.ragTopK,
        ragSimilarityThreshold: p.ragSimilarityThreshold,
        skipAppendUser: skip,
      })
    }
    if (p.mode === 'literature') {
      const cid = p.literatureCollectionId?.trim()
      if (!cid) {
        error.value = '请选择文献库'
        return
      }
      return send(userText, {
        temperature: p.temperature,
        maxHistoryTurns: p.maxHistoryTurns,
        scrollRoot: p.scrollRoot,
        literatureCollectionId: cid,
        literatureRagTopK: p.literatureTopK,
        literatureSimilarityThreshold: p.literatureThreshold,
        skipAppendUser: skip,
      })
    }
    if (p.mode === 'knowledge') {
      const kb = p.knowledgeBaseId
      if (kb == null) {
        error.value = '请选择知识库'
        return
      }
      return send(userText, {
        temperature: p.temperature,
        maxHistoryTurns: p.maxHistoryTurns,
        scrollRoot: p.scrollRoot,
        knowledgeBaseId: kb,
        ragTopK: p.ragTopK,
        ragSimilarityThreshold: p.ragSimilarityThreshold,
        skipAppendUser: skip,
      })
    }
    return send(userText, {
      temperature: p.temperature,
      maxHistoryTurns: p.maxHistoryTurns,
      scrollRoot: p.scrollRoot,
      skipAppendUser: skip,
    })
  }

  return {
    sessions,
    sessionId,
    messages,
    loading,
    error,
    streamingContent,
    ragMeta,
    fetchSessions,
    ensureSession,
    loadHistory,
    openSession,
    newSession,
    deleteSession,
    send,
    sendVisionAgent,
    sendOmni,
    stop,
  }
}

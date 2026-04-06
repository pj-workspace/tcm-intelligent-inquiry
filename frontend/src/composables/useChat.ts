import { ref, nextTick } from 'vue'
import { silentAxiosConfig } from '@/api/core/client'
import { getErrorMessage } from '@/api/core/errors'
import { openSseStream } from '@/api/core/sse'
import {
  CONSULTATION_CHAT_STREAM_URL,
  createConsultationSession,
  deleteConsultationSession,
  listConsultationMessages,
  listConsultationSessions,
} from '@/api/modules/consultation'
import { postAgentRunJson } from '@/api/modules/agent'
import type {
  ChatSessionInfo,
  HerbSafetyCheckResult,
  TcmDiagnosisReport,
} from '@/types/consultation'
import type { KnowledgeRetrievedPassage } from '@/types/knowledge'
import {
  parseConsultationReportSsePayload,
  tryParseDiagnosisReportFromMarkdown,
} from '@/utils/diagnosisReport'
import { normalizeMetaPassages } from '@/utils/retrievalTrace'
import { encodeImageFileToHerbPayload } from '@/utils/herbImagePayload'

export type ChatTurn = {
  role: 'user' | 'assistant'
  content: string
  /** 结构化辨证摘要（SSE {@code report} 或从历史正文解析） */
  diagnosisReport?: TcmDiagnosisReport
  /** 配伍禁忌扫描（仅 SSE 附带；历史记录多为空） */
  herbSafety?: HerbSafetyCheckResult | null
  /** RAG 溯源摘录（与 meta.passages / 落库一致） */
  retrievalPassages?: KnowledgeRetrievedPassage[]
}

/** 兼容旧路径：`import type { ChatSessionInfo } from '@/composables/useChat'` */
export type { ChatSessionInfo }

/** localStorage 键：刷新后恢复上次打开的问诊会话。 */
export const CONSULTATION_LAST_SESSION_KEY = 'tcm-consultation-last-session-id'

export type SendOptions = {
  temperature?: number
  /** 核采样 Top-P；不传则后端使用默认（如 0.9） */
  topP?: number
  maxHistoryTurns?: number
  scrollRoot?: HTMLElement | null
  /** 可选：问诊时检索该知识库摘录注入模型（与智能体 RAG 同源）。 */
  knowledgeBaseId?: number | null
  ragTopK?: number | null
  ragSimilarityThreshold?: number | null
  /** 临时文献库 ID；走问诊同一 SSE，与知识库可同时作为 Agent 默认上下文。 */
  literatureCollectionId?: string | null
  literatureRagTopK?: number | null
  literatureSimilarityThreshold?: number | null
  /** 附图为药材 / 舌象等时随 JSON 写入后端，供 herb_image_recognition_tool。 */
  herbImageBase64?: string | null
  herbImageMimeType?: string | null
  /**
   * 气泡中展示的用户正文；不传则与发给模型的 {@code message}（首参）相同。
   * 用于「主诉在模型侧保持简洁、气泡可带附图说明」。
   */
  userBubbleText?: string | null
  /** 不向消息列表追加用户条目（重新生成上一答时，列表末尾已是用户） */
  skipAppendUser?: boolean
}

/** 问诊流式接口首包 {@code event: meta}（ReAct 工具命中摘要或旧版预检索）。 */
export type ConsultationRagMeta = {
  sources: string[]
  retrievedChunks: number
  knowledgeBaseId?: number
  literatureCollectionId?: string
  /** 来自知识库工具的来源文件名 */
  knowledgeSources?: string[]
  /** 来自文献工具的来源文件名 */
  literatureSources?: string[]
  /** 后端 Agent 模式，如 react+tools */
  agentMode?: string
  /** 与后端 meta.passages 一致（Top 溯源） */
  passages?: KnowledgeRetrievedPassage[]
}

/** 后端 {@code event: phase} 负载（与 claw-code 编排进度语义对齐，供顶栏状态条展示）。 */
export type StreamPhasePayload = {
  phase: string
  label: string
  /** 附注：上下文摘要、工具说明等 */
  detail?: string
  /** 步骤序号（从 1 起） */
  step?: number
  /** JSON 顶层 {@code type}，如 {@code phase}（claw-code 判别式 wire） */
  wireType?: string
}

/** 单轮 SSE 内阶段时间线项（claw-code Hook/Lane 式可观测性简化版）。 */
export type StreamActivityEntry = {
  ts: number
  phase: string
  label: string
  detail?: string
  step?: number
}

const STREAM_ACTIVITY_MAX = 24

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
  /** 当前流式回合结构化报告（后端 {@code event: report}）；可与正文并列更新 */
  const streamingDiagnosisReport = ref<TcmDiagnosisReport | null>(null)
  /** 与 {@code report} 事件同发的配伍审查结果 */
  const streamingHerbSafety = ref<HerbSafetyCheckResult | null>(null)
  /** 当前流式回合 RAG 溯源（meta.passages，与落库对齐） */
  const streamingRetrievalPassages = ref<KnowledgeRetrievedPassage[]>([])
  /** 当前回合知识库检索摘要（仅当本轮请求携带 knowledgeBaseId 且收到 meta 时有效） */
  const ragMeta = ref<ConsultationRagMeta | null>(null)
  /** 本轮 SSE 编排阶段（由后端 {@code event: phase} 推送，优先于前端猜阶段文案） */
  const streamPhase = ref<StreamPhasePayload | null>(null)
  /** 本轮已收阶段事件时间线（供界面「编排追踪」展开） */
  const streamActivityLog = ref<StreamActivityEntry[]>([])
  let abort: AbortController | null = null

  function appendStreamActivity(entry: Omit<StreamActivityEntry, 'ts'>) {
    const row: StreamActivityEntry = { ts: Date.now(), ...entry }
    const next = [...streamActivityLog.value, row]
    streamActivityLog.value =
      next.length > STREAM_ACTIVITY_MAX
        ? next.slice(-STREAM_ACTIVITY_MAX)
        : next
  }

  function persistLastSession(id: number | null) {
    if (id == null) localStorage.removeItem(CONSULTATION_LAST_SESSION_KEY)
    else localStorage.setItem(CONSULTATION_LAST_SESSION_KEY, String(id))
  }

  async function fetchSessions() {
    const { data } = await listConsultationSessions(silentAxiosConfig)
    if (data.code !== 0) {
      throw new Error(data.message || '加载会话列表失败')
    }
    sessions.value = data.data ?? []
  }

  async function ensureSession() {
    if (sessionId.value != null) return
    const { data } = await createConsultationSession(silentAxiosConfig)
    if (data.code !== 0 || !data.data) {
      throw new Error(data.message || '创建会话失败')
    }
    sessionId.value = data.data.id
  }

  async function loadHistory() {
    if (sessionId.value == null) return
    const { data } = await listConsultationMessages(
      sessionId.value,
      silentAxiosConfig
    )
    if (data.code !== 0) {
      throw new Error(data.message || '加载历史失败')
    }
    const list = data.data ?? []
    const next: ChatTurn[] = []
    for (const m of list) {
      next.push({ role: 'user', content: m.userMessage })
      const a = m.assistantMessage
      const diagnosisReport = tryParseDiagnosisReportFromMarkdown(a)
      next.push({
        role: 'assistant',
        content: a,
        ...(diagnosisReport ? { diagnosisReport } : {}),
        ...(m.retrievalPassages?.length
          ? { retrievalPassages: m.retrievalPassages }
          : {}),
      })
    }
    messages.value = next
  }

  async function openSession(id: number) {
    stop()
    error.value = null
    streamingContent.value = ''
    streamingDiagnosisReport.value = null
    streamingHerbSafety.value = null
    streamingRetrievalPassages.value = []
    ragMeta.value = null
    streamPhase.value = null
    streamActivityLog.value = []
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
    streamingDiagnosisReport.value = null
    streamingHerbSafety.value = null
    streamingRetrievalPassages.value = []
    ragMeta.value = null
    streamPhase.value = null
    streamActivityLog.value = []
    error.value = null
    await ensureSession()
    if (sessionId.value != null) persistLastSession(sessionId.value)
    await fetchSessions()
  }

  async function deleteSession(id: number) {
    await deleteConsultationSession(id, silentAxiosConfig)
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

    const bubble =
      opts?.userBubbleText != null && opts.userBubbleText.trim() !== ''
        ? opts.userBubbleText.trim()
        : text

    error.value = null
    ragMeta.value = null
    streamPhase.value = null
    streamActivityLog.value = []
    if (!opts?.skipAppendUser) {
      messages.value = [...messages.value, { role: 'user', content: bubble }]
    }
    streamingContent.value = ''
    streamingDiagnosisReport.value = null
    streamingHerbSafety.value = null
    streamingRetrievalPassages.value = []
    loading.value = true
    abort = new AbortController()

    const body: Record<string, unknown> = {
      sessionId: sessionId.value,
      message: text,
      temperature: opts?.temperature,
      topP: opts?.topP,
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
    if (
      opts?.herbImageBase64 != null &&
      String(opts.herbImageBase64).trim() !== ''
    ) {
      body.herbImageBase64 = String(opts.herbImageBase64).trim()
      if (
        opts.herbImageMimeType != null &&
        String(opts.herbImageMimeType).trim() !== ''
      ) {
        body.herbImageMimeType = String(opts.herbImageMimeType).trim()
      }
    }

    let assistant = ''
    const kbIdForMeta = opts?.knowledgeBaseId ?? null
    const litIdForMeta = opts?.literatureCollectionId ?? null
    try {
      await openSseStream(
        CONSULTATION_CHAT_STREAM_URL,
        (chunk) => {
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
            if (name === 'report') {
              const parsed = parseConsultationReportSsePayload(data)
              if (parsed) {
                streamingDiagnosisReport.value = parsed.report
                streamingHerbSafety.value = parsed.safety
              }
              return
            }
            if (name === 'assistant') {
              try {
                const o = JSON.parse(data) as {
                  type?: string
                  text?: string
                  name?: string
                  phase?: string
                  input_preview?: string
                }
                if (o.type === 'message_stop') {
                  return
                }
                if (o.type === 'tool_use') {
                  const toolName = typeof o.name === 'string' ? o.name : ''
                  const phase = typeof o.phase === 'string' ? o.phase : ''
                  const preview =
                    typeof o.input_preview === 'string'
                      ? o.input_preview.trim()
                      : ''
                  const toolLabel = (n: string) => {
                    if (n === 'knowledge_retrieval_tool') return '知识库检索'
                    if (n === 'literature_retrieval_tool') return '文献检索'
                    if (n === 'herb_image_recognition_tool') return '药材识图'
                    return n
                  }
                  const label =
                    phase === 'start'
                      ? `${toolLabel(toolName)} · 开始`
                      : phase === 'end'
                        ? `${toolLabel(toolName)} · 完成`
                        : `${toolLabel(toolName)} · ${phase}`
                  appendStreamActivity({
                    phase: `tool:${toolName}:${phase}`,
                    label,
                    ...(preview !== '' ? { detail: preview } : {}),
                  })
                  return
                }
                if (
                  o.type === 'text_delta' &&
                  typeof o.text === 'string' &&
                  o.text !== ''
                ) {
                  assistant += o.text
                  streamingContent.value = assistant
                  scrollToBottom(opts?.scrollRoot ?? null)
                }
              } catch {
                /* ignore */
              }
              return
            }
            if (name === 'phase') {
              try {
                const o = JSON.parse(data) as {
                  type?: string
                  phase?: string
                  label?: string
                  detail?: string
                  step?: number
                }
                if (typeof o.label === 'string') {
                  const detail =
                    typeof o.detail === 'string' && o.detail.trim() !== ''
                      ? o.detail.trim()
                      : undefined
                  const step =
                    typeof o.step === 'number' && Number.isFinite(o.step)
                      ? o.step
                      : undefined
                  const wireType =
                    typeof o.type === 'string' ? o.type : undefined
                  streamPhase.value = {
                    phase: typeof o.phase === 'string' ? o.phase : '',
                    label: o.label,
                    ...(detail !== undefined ? { detail } : {}),
                    ...(step !== undefined ? { step } : {}),
                    ...(wireType !== undefined ? { wireType } : {}),
                  }
                  appendStreamActivity({
                    phase: typeof o.phase === 'string' ? o.phase : '',
                    label: o.label,
                    ...(detail !== undefined ? { detail } : {}),
                    ...(step !== undefined ? { step } : {}),
                  })
                }
              } catch {
                /* ignore */
              }
              return
            }
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
              const knowledgeSources = Array.isArray(o.knowledgeSources)
                ? (o.knowledgeSources as string[])
                : undefined
              const literatureSources = Array.isArray(o.literatureSources)
                ? (o.literatureSources as string[])
                : undefined
              const agentMode =
                typeof o.mode === 'string' ? (o.mode as string) : undefined
              const passages = normalizeMetaPassages(o.passages)
              streamingRetrievalPassages.value = passages
              ragMeta.value = {
                sources,
                retrievedChunks,
                knowledgeBaseId,
                literatureCollectionId,
                knowledgeSources,
                literatureSources,
                agentMode,
                passages,
              }
            } catch {
              /* ignore */
            }
          },
        }
      )
      const fromEvent = streamingDiagnosisReport.value
      const fromMarkdown =
        fromEvent == null
          ? tryParseDiagnosisReportFromMarkdown(assistant)
          : null
      const diagnosisReport = fromEvent ?? fromMarkdown ?? undefined
      const herbSafetySnap = streamingHerbSafety.value
      const traceSnap = [...streamingRetrievalPassages.value]
      messages.value = [
        ...messages.value,
        {
          role: 'assistant',
          content: assistant,
          ...(diagnosisReport ? { diagnosisReport } : {}),
          ...(herbSafetySnap != null ? { herbSafety: herbSafetySnap } : {}),
          ...(traceSnap.length ? { retrievalPassages: traceSnap } : {}),
        },
      ]
      streamingContent.value = ''
      streamingDiagnosisReport.value = null
      streamingHerbSafety.value = null
      streamingRetrievalPassages.value = []
      streamPhase.value = null
      await fetchSessions()
    } catch (e: unknown) {
      if ((e as Error)?.name === 'AbortError') {
        error.value = '已停止生成'
        if (assistant) {
          const fromEvent = streamingDiagnosisReport.value
          const fromMarkdown =
            fromEvent == null
              ? tryParseDiagnosisReportFromMarkdown(assistant)
              : null
          const diagnosisReport = fromEvent ?? fromMarkdown ?? undefined
          const herbSafetySnap = streamingHerbSafety.value
          const traceSnap = [...streamingRetrievalPassages.value]
          messages.value = [
            ...messages.value,
            {
              role: 'assistant',
              content: assistant + '\n…（已中断）',
              ...(diagnosisReport ? { diagnosisReport } : {}),
              ...(herbSafetySnap != null ? { herbSafety: herbSafetySnap } : {}),
              ...(traceSnap.length ? { retrievalPassages: traceSnap } : {}),
            },
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
      streamingDiagnosisReport.value = null
      streamingHerbSafety.value = null
      streamingRetrievalPassages.value = []
      streamPhase.value = null
    } finally {
      loading.value = false
      abort = null
      streamPhase.value = null
      scrollToBottom(opts?.scrollRoot ?? null)
    }
  }

  function stop() {
    abort?.abort()
  }

  /**
   * 视觉智能体：POST /v1/agent/run（JSON），非 SSE；回复写入本会话消息列表。
   * 纯文本：仅 task（及可选知识库 RAG 参数）。
   * 附图：将首张图编码为 herbImageBase64 随 JSON 提交，后端注入 ToolContext，
   * 走文本模型 + ReAct 工具链并触发 herb_image_recognition_tool（多图时仅首图进入工具，任务文案中会注明张数）。
   */
  async function sendVisionAgent(
    userText: string,
    images: File[],
    opts?: Pick<
      SendOptions,
      | 'scrollRoot'
      | 'knowledgeBaseId'
      | 'ragTopK'
      | 'ragSimilarityThreshold'
      | 'literatureCollectionId'
      | 'literatureRagTopK'
      | 'literatureSimilarityThreshold'
      | 'skipAppendUser'
    >
  ) {
    const text = userText.trim()
    if (!text || loading.value) return

    await ensureSession()
    if (sessionId.value == null) throw new Error('无会话')

    error.value = null
    ragMeta.value = null
    streamPhase.value = null
    streamActivityLog.value = []
    const names = images.map((f) => f.name).join('、')
    const userLabel =
      images.length > 0 ? `${text}\n\n（附图${images.length}张：${names}）` : text
    if (!opts?.skipAppendUser) {
      messages.value = [...messages.value, { role: 'user', content: userLabel }]
    }
    streamingContent.value = ''
    streamingDiagnosisReport.value = null
    streamingHerbSafety.value = null
    streamingRetrievalPassages.value = []
    loading.value = true

    try {
      const body: Record<string, unknown> = {
        task:
          images.length > 1
            ? `${text}\n\n（用户共上传 ${images.length} 张图；药材识别工具仅分析首张：${images[0]!.name}）`
            : text,
      }
      if (images.length > 0) {
        const { herbImageBase64, herbImageMimeType } =
          await encodeImageFileToHerbPayload(images[0]!)
        body.herbImageBase64 = herbImageBase64
        body.herbImageMimeType = herbImageMimeType
      }
      const kb = opts?.knowledgeBaseId
      if (kb != null) {
        body.knowledgeBaseId = kb
        if (opts?.ragTopK != null) body.ragTopK = opts.ragTopK
        if (opts?.ragSimilarityThreshold != null) {
          body.ragSimilarityThreshold = opts.ragSimilarityThreshold
        }
      }
      const lit = opts?.literatureCollectionId?.trim()
      if (lit) {
        body.literatureCollectionId = lit
        if (opts?.literatureRagTopK != null) {
          body.literatureRagTopK = opts.literatureRagTopK
        }
        if (opts?.literatureSimilarityThreshold != null) {
          body.literatureSimilarityThreshold = opts.literatureSimilarityThreshold
        }
      }
      const res = await postAgentRunJson(body, silentAxiosConfig)
      const data = res.data
      if (data.code !== 0) throw new Error(data.message || '智能体调用失败')
      const answer = data.data?.assistant ?? ''
      const kbSources = data.data?.knowledgeSources ?? []
      const litSources = data.data?.literatureSources ?? []
      const mode = data.data?.mode
      const merged = [...kbSources, ...litSources]
      if (merged.length > 0 || mode === 'react+tools') {
        ragMeta.value = {
          sources: merged,
          retrievedChunks: merged.length,
          knowledgeBaseId: kb ?? undefined,
          literatureCollectionId: lit && lit !== '' ? lit : undefined,
          knowledgeSources: kbSources,
          literatureSources: litSources,
          agentMode: mode,
        }
      }
      const visionReport = tryParseDiagnosisReportFromMarkdown(answer)
      messages.value = [
        ...messages.value,
        {
          role: 'assistant',
          content: answer,
          ...(visionReport ? { diagnosisReport: visionReport } : {}),
        },
      ]
      await fetchSessions()
    } catch (e: unknown) {
      error.value = getErrorMessage(e)
      if (!opts?.skipAppendUser) {
        messages.value = messages.value.slice(0, -1)
      }
    } finally {
      loading.value = false
      streamPhase.value = null
      streamingDiagnosisReport.value = null
      streamingHerbSafety.value = null
      streamingRetrievalPassages.value = []
      scrollToBottom(opts?.scrollRoot ?? null)
    }
  }

  return {
    sessions,
    sessionId,
    messages,
    loading,
    error,
    streamingContent,
    streamingDiagnosisReport,
    streamingHerbSafety,
    streamingRetrievalPassages,
    ragMeta,
    streamPhase,
    streamActivityLog,
    fetchSessions,
    ensureSession,
    loadHistory,
    openSession,
    newSession,
    deleteSession,
    send,
    sendVisionAgent,
    stop,
  }
}

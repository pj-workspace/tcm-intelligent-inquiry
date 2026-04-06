<script setup lang="ts">
import {
  computed,
  inject,
  onMounted,
  onUnmounted,
  ref,
  watch,
  nextTick,
} from 'vue'
import { silentAxiosConfig } from '@/api/core/client'
import { getErrorMessage } from '@/api/core/errors'
import { getAgentConfig } from '@/api/modules/agent'
import { getConsultationHealth } from '@/api/modules/consultation'
import {
  listKnowledgeBases,
} from '@/api/modules/knowledge'
import { listLiteratureUploads } from '@/api/modules/literature'
import type { KnowledgeBase } from '@/types/knowledge'
import type { ConsultationRagMeta, SendOptions } from '@/composables/useChat'
import ChatDocMessage from '@/components/business/ChatDocMessage.vue'
import DsAlert from '@/components/common/DsAlert.vue'
import DsSelect from '@/components/common/DsSelect.vue'
import type { DsSelectOption } from '@/components/common/DsSelect.vue'
import { useBrailleSpinner } from '@/composables/useBrailleSpinner'
import { useConsultChatPrefs } from '@/composables/useConsultChatPrefs'
import { useOmniChatContext } from '@/composables/useOmniChatContext'
import { formatHealthStatus, isHealthStatusErr } from '@/utils/formatHealthStatus'
import {
  downloadConsultationMarkdownFile,
  downloadConsultationPdfFile,
} from '@/utils/consultExport'
import { encodeImageFileToHerbPayload } from '@/utils/herbImagePayload'
import { LITERATURE_TAB_COLLECTION_SESSION_KEY } from '@/utils/literatureBeacon'
import { CONSULT_CHAT_KEY } from '@/constants/injectionKeys'

const chat = inject(CONSULT_CHAT_KEY)
if (!chat) {
  throw new Error('ConsultChatView must be mounted under ConsultationLayout')
}

const {
  messages,
  sessions,
  sessionId,
  loading,
  error,
  streamingContent,
  ragMeta,
  streamPhase,
  streamActivityLog,
  send,
  stop,
} = chat

const {
  knowledgeBaseId,
  literatureCollectionId,
  pendingImages,
  addImagesFromInput,
  removeImageAt,
  clearPendingImages,
} = useOmniChatContext()

/** 仿 claw-code CLI 分阶段进度：优先展示后端 {@code event: phase}，缺省时再用前端启发式文案 */
const { spinChar } = useBrailleSpinner(loading)
const orchestrationLabel = computed(() => {
  if (!loading.value) return ''
  const server = streamPhase.value?.label?.trim()
  if (server) return server
  const stream = streamingContent.value.trim()
  if (!stream) return '连接本地大模型…'
  return '模型流式输出中…'
})

/** 后端 phase.detail（附注）；与主标题分行展示，避免顶栏过长 */
const orchestrationDetail = computed(() => {
  if (!loading.value) return ''
  const d = streamPhase.value?.detail?.trim()
  return d ?? ''
})

const orchestrationStep = computed(() => {
  const s = streamPhase.value?.step
  if (typeof s !== 'number' || !Number.isFinite(s)) return null
  return Math.max(1, Math.floor(s))
})

const health = ref<string>('')
const settingsWrapRef = ref<HTMLElement | null>(null)
const threadEl = ref<HTMLElement | null>(null)
const input = ref('')
const knowledgeBases = ref<KnowledgeBase[]>([])

/** 模型参数、RAG 数值与设置面板展开态：localStorage + sessionStorage，见 composable 内中文说明 */
const {
  temperature,
  topP,
  maxHistoryTurns,
  ragTopK,
  ragSimilarityThreshold,
  literatureTopK,
  literatureThreshold,
  settingsOpen,
  advOpen,
  onConsultAdvToggle,
} = useConsultChatPrefs()
const literatureCollections = ref<{ id: string; label: string }[]>([])
const attachInput = ref<HTMLInputElement | null>(null)
const exportBusy = ref(false)
const exportHint = ref<string | null>(null)

/** 侧边栏会话标题，用于导出文件名与文档抬头 */
const currentSessionTitle = computed(() => {
  const id = sessionId.value
  if (id == null) return '问诊记录'
  return sessions.value.find((s) => s.id === id)?.title ?? `会话 #${id}`
})

let exportHintTimer: ReturnType<typeof setTimeout> | null = null
function flashExportHint(text: string) {
  exportHint.value = text
  if (exportHintTimer) clearTimeout(exportHintTimer)
  exportHintTimer = setTimeout(() => {
    exportHint.value = null
    exportHintTimer = null
  }, 4500)
}

async function onExportMarkdown() {
  const title = currentSessionTitle.value
  const streamSnap =
    loading.value && streamingContent.value ? streamingContent.value : null
  if (
    messages.value.length === 0 &&
    (streamSnap == null || streamSnap.trim() === '')
  ) {
    flashExportHint('当前没有可导出的对话内容')
    return
  }
  try {
    downloadConsultationMarkdownFile(title, messages.value, streamSnap)
    flashExportHint('已下载 Markdown 文件')
  } catch (e) {
    flashExportHint(`导出失败：${getErrorMessage(e)}`)
  }
}

async function onExportPdf() {
  const title = currentSessionTitle.value
  const streamSnap =
    loading.value && streamingContent.value ? streamingContent.value : null
  if (
    messages.value.length === 0 &&
    (streamSnap == null || streamSnap.trim() === '')
  ) {
    flashExportHint('当前没有可导出的对话内容')
    return
  }
  exportBusy.value = true
  exportHint.value = null
  try {
    // PDF 生成依赖离屏渲染与 canvas，体积大时可能阻塞片刻；按钮 loading 提升可感知性
    await downloadConsultationPdfFile(title, messages.value, streamSnap)
    flashExportHint('已生成并下载 PDF')
  } catch (e) {
    flashExportHint(`PDF 导出失败：${getErrorMessage(e)}`)
  } finally {
    exportBusy.value = false
  }
}

const knowledgeSelectOptions = computed<DsSelectOption[]>(() => {
  const head: DsSelectOption[] = [{ value: null, label: '不指定' }]
  return [
    ...head,
    ...knowledgeBases.value.map((b) => ({
      value: b.id as number,
      label: b.name,
    })),
  ]
})

const literatureSelectOptions = computed<DsSelectOption[]>(() => {
  const head: DsSelectOption[] = [{ value: '', label: '不指定' }]
  return [
    ...head,
    ...literatureCollections.value.map((c) => ({
      value: c.id,
      label: c.label,
    })),
  ]
})

function formatRagLog(meta: ConsultationRagMeta | null): string | null {
  if (!meta) return null
  const lines: string[] = []
  if (meta.agentMode) {
    lines.push(`编排：${meta.agentMode}`)
  }
  if (meta.knowledgeBaseId != null) {
    lines.push(`请求侧知识库：#${meta.knowledgeBaseId}`)
  }
  if (meta.literatureCollectionId) {
    lines.push(`请求侧文献库：${meta.literatureCollectionId}`)
  }
  if (meta.knowledgeSources?.length) {
    lines.push(`知识库工具来源：${meta.knowledgeSources.join('、')}`)
  }
  if (meta.literatureSources?.length) {
    lines.push(`文献工具来源：${meta.literatureSources.join('、')}`)
  }
  lines.push(`工具命中条数（估）：${meta.retrievedChunks}`)
  if (meta.sources.length) {
    lines.push(`合并来源：${meta.sources.join('、')}`)
  }
  return lines.join('\n')
}

/** 流式输出期间收入助手折叠区，避免与顶栏 RAG 提示重复 */
const streamingRagLog = computed(() => {
  if (!loading.value || !streamingContent.value) return null
  return formatRagLog(ragMeta.value)
})

async function loadKnowledgeBases() {
  try {
    const { data } = await listKnowledgeBases(silentAxiosConfig)
    if (data.code !== 0) return
    knowledgeBases.value = data.data ?? []
  } catch {
    /* 知识库不可用时仍可纯问诊 */
  }
}

async function loadLiteratureCollections() {
  try {
    const { data } = await listLiteratureUploads(silentAxiosConfig)
    if (data.code !== 0) return
    const files = data.data ?? []
    const seen = new Set<string>()
    const rows: { id: string; label: string }[] = []
    for (const f of files) {
      const cid = f.tempCollectionId?.trim()
      if (!cid || seen.has(cid)) continue
      seen.add(cid)
      const short = cid.length > 12 ? `${cid.slice(0, 10)}…` : cid
      rows.push({ id: cid, label: `文献库 ${short}` })
    }
    literatureCollections.value = rows
  } catch {
    literatureCollections.value = []
  }
}

async function loadAgentDefaults() {
  try {
    const { data } = await getAgentConfig(silentAxiosConfig)
    if (data.code !== 0 || !data.data) return
    const kb = data.data.defaultKnowledgeBaseId
    if (kb != null && knowledgeBaseId.value == null) {
      knowledgeBaseId.value = kb
    }
  } catch {
    /* optional */
  }
}

function scrollToBottom() {
  nextTick(() => {
    const el = threadEl.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

watch(
  () => [messages.value, streamingContent.value],
  () => scrollToBottom(),
  { deep: true }
)

function closeSettingsOnOutside(ev: MouseEvent) {
  if (!settingsOpen.value) return
  const el = settingsWrapRef.value
  const t = ev.target
  if (el && t instanceof Node && el.contains(t)) return
  settingsOpen.value = false
}

function toggleSettings() {
  settingsOpen.value = !settingsOpen.value
}

onMounted(async () => {
  document.addEventListener('click', closeSettingsOnOutside)
  try {
    if (!literatureCollectionId.value.trim()) {
      const b = sessionStorage.getItem(LITERATURE_TAB_COLLECTION_SESSION_KEY)
      if (b?.trim()) {
        literatureCollectionId.value = b.trim()
      }
    }
  } catch {
    /* ignore */
  }
  try {
    const { data } = await getConsultationHealth(silentAxiosConfig)
    const line = formatHealthStatus(data.code, data.message ?? '')
    health.value = isHealthStatusErr(line) ? line : ''
  } catch (e) {
    health.value = `后端不可用: ${getErrorMessage(e)}`
  }
  void loadKnowledgeBases()
  void loadLiteratureCollections()
  void loadAgentDefaults()
})

onUnmounted(() => {
  document.removeEventListener('click', closeSettingsOnOutside)
  if (exportHintTimer) clearTimeout(exportHintTimer)
})

function onAttachClick() {
  attachInput.value?.click()
}

function onAttachChange(e: Event) {
  const el = e.target as HTMLInputElement
  addImagesFromInput(el.files)
  el.value = ''
}

function buildSendOptions(skipAppendUser = false): SendOptions {
  const lit =
    literatureCollectionId.value.trim() === ''
      ? null
      : literatureCollectionId.value.trim()
  const opts: SendOptions = {
    temperature: temperature.value,
    topP: topP.value,
    maxHistoryTurns: maxHistoryTurns.value,
    scrollRoot: threadEl.value,
    skipAppendUser,
  }
  if (knowledgeBaseId.value != null) {
    opts.knowledgeBaseId = knowledgeBaseId.value
    opts.ragTopK = ragTopK.value
    opts.ragSimilarityThreshold = ragSimilarityThreshold.value
  }
  if (lit) {
    opts.literatureCollectionId = lit
    opts.literatureRagTopK = literatureTopK.value
    opts.literatureSimilarityThreshold = literatureThreshold.value
  }
  return opts
}

async function onSend() {
  const text = input.value.trim()
  if (!text || loading.value) return

  input.value = ''

  const files = [...pendingImages.value]
  let herbPayload: { herbImageBase64?: string; herbImageMimeType?: string } =
    {}
  if (files.length > 0) {
    herbPayload = await encodeImageFileToHerbPayload(files[0]!)
  }
  const names = files.map((f) => f.name).join('、')
  const userBubbleText =
    files.length > 0
      ? `${text}\n\n（附图 ${files.length} 张：${names}；识图工具默认分析首张）`
      : undefined

  const opts = buildSendOptions(false)
  if (herbPayload.herbImageBase64) {
    opts.herbImageBase64 = herbPayload.herbImageBase64
    opts.herbImageMimeType = herbPayload.herbImageMimeType
  }
  if (userBubbleText) {
    opts.userBubbleText = userBubbleText
  }

  await send(text, opts)
  if (!error.value) clearPendingImages()
}

async function onRegenerateAssistant() {
  if (loading.value) return
  const arr = messages.value
  if (arr.length < 2) return
  const last = arr[arr.length - 1]
  const prev = arr[arr.length - 2]
  if (last.role !== 'assistant' || prev.role !== 'user') return
  messages.value = arr.slice(0, -1)
  const bubble = prev.content.trim()
  if (!bubble) return
  /** 重新生成仅重复用户气泡原文，无法还原附图二进制，故不传 herb */
  const textForModel = bubble.includes('\n\n（附图')
    ? (bubble.split('\n\n（附图')[0] ?? bubble).trim()
    : bubble
  await send(textForModel, { ...buildSendOptions(true), userBubbleText: bubble })
}

function canSend() {
  if (!input.value.trim() || loading.value) return false
  return true
}
</script>

<template>
  <div class="consult-chat ds-main__grow">
    <header class="consult-header">
      <div class="consult-header__top">
        <div class="consult-header__main">
          <h2 class="ds-h2 consult-header__title">
            中医智能问诊
          </h2>
          <p
            v-if="health"
            class="ds-status consult-header__status ds-status--err"
          >
            {{ health }}
          </p>
        </div>
        <div class="consult-header__side">
          <div
            class="consult-export-actions"
            role="group"
            aria-label="导出当前会话"
          >
            <button
              type="button"
              class="ds-btn ds-btn--ghost consult-export__btn"
              :disabled="loading || exportBusy"
              @click="onExportMarkdown"
            >
              导出 Markdown
            </button>
            <button
              type="button"
              class="ds-btn ds-btn--ghost consult-export__btn"
              :disabled="loading || exportBusy"
              @click="onExportPdf"
            >
              {{ exportBusy ? '生成 PDF…' : '导出 PDF' }}
            </button>
          </div>
          <button
            v-if="loading"
            type="button"
            class="ds-btn ds-btn--warn consult-header__stop"
            @click="stop"
          >
            停止
          </button>
          <div
            ref="settingsWrapRef"
            class="consult-settings"
          >
            <button
              type="button"
              class="ds-btn ds-btn--icon ds-btn--subtle consult-settings__trigger"
              :aria-expanded="settingsOpen"
              aria-controls="consult-settings-panel"
              aria-label="问诊设置：默认挂载与模型参数"
              title="问诊设置"
              @click.stop="toggleSettings"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="22"
                height="22"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="1.75"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.281Z"
                />
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                />
              </svg>
            </button>
            <div
              v-show="settingsOpen"
              id="consult-settings-panel"
              class="consult-settings__panel"
              role="dialog"
              aria-label="问诊设置"
              @click.stop
            >
              <div class="omni-bar omni-bar--panel">
                <p class="omni-vision-note omni-vision-note--compact">
                  本轮由后端 Agent 按需调用知识库、文献与识图工具；无需再选手动模式。可选填默认挂载（亦为模型 ToolContext 默认值）。
                </p>

                <div
                  v-if="knowledgeBases.length > 0"
                  class="omni-bar__mount"
                >
                  <label class="omni-mount-label">
                    默认知识库（可选）
                    <DsSelect
                      v-model="knowledgeBaseId"
                      class="omni-select"
                      :options="knowledgeSelectOptions"
                      placeholder="不指定则仅智能体配置中的默认库"
                      :disabled="loading"
                      aria-label="默认知识库"
                    />
                  </label>
                </div>
                <div
                  v-else
                  class="omni-hint"
                >
                  暂无知识库；可在「知识库」页创建后在此指定默认库。
                </div>

                <div class="omni-bar__mount">
                  <label class="omni-mount-label">
                    默认文献库（可选）
                    <DsSelect
                      v-model="literatureCollectionId"
                      class="omni-select"
                      :options="literatureSelectOptions"
                      placeholder="可选；文献页会自动写入 session"
                      :disabled="loading"
                      aria-label="默认文献库"
                    />
                  </label>
                  <button
                    type="button"
                    class="ds-btn ds-btn--ghost omni-refresh"
                    :disabled="loading"
                    @click="loadLiteratureCollections"
                  >
                    刷新列表
                  </button>
                </div>
              </div>

              <details
                class="consult-adv consult-adv--panel"
                :open="advOpen"
                @toggle="onConsultAdvToggle"
              >
                <summary class="consult-adv__summary">
                  模型、RAG 参数与上下文
                </summary>
                <div class="consult-adv__body">
                  <p class="consult-slider-intro ds-hint">
                    以下三项支持滑条与数值框联动（企业级 SaaS 常见交互），便于快速扫参。
                  </p>
                  <div class="consult-slider-grid">
                    <div class="consult-slider-item">
                      <div class="consult-slider-item__label">
                        Temperature
                      </div>
                      <el-slider
                        v-model="temperature"
                        :min="0"
                        :max="2"
                        :step="0.1"
                        :show-input="true"
                        :disabled="loading"
                        input-size="small"
                        class="consult-el-slider"
                      />
                    </div>
                    <div class="consult-slider-item">
                      <div class="consult-slider-item__label">
                        Top-P
                      </div>
                      <el-slider
                        v-model="topP"
                        :min="0.05"
                        :max="1"
                        :step="0.05"
                        :show-input="true"
                        :disabled="loading"
                        input-size="small"
                        class="consult-el-slider"
                      />
                    </div>
                    <div class="consult-slider-item">
                      <div class="consult-slider-item__label">
                        历史轮数上限
                      </div>
                      <el-slider
                        v-model="maxHistoryTurns"
                        :min="1"
                        :max="50"
                        :step="1"
                        :show-input="true"
                        :disabled="loading"
                        input-size="small"
                        class="consult-el-slider"
                      />
                    </div>
                  </div>
                  <div class="ds-row consult-controls consult-controls--wrap consult-controls--rag">
                    <label class="ds-field">
                      知识库 RAG topK
                      <input
                        v-model.number="ragTopK"
                        class="ds-input ds-input--narrow"
                        type="number"
                        min="1"
                        max="20"
                        step="1"
                        :disabled="loading"
                      >
                    </label>
                    <label class="ds-field">
                      知识库相似度
                      <input
                        v-model.number="ragSimilarityThreshold"
                        class="ds-input ds-input--narrow"
                        type="number"
                        inputmode="decimal"
                        min="0"
                        max="1"
                        step="0.05"
                        :disabled="loading"
                      >
                    </label>
                    <label class="ds-field">
                      文献 topK
                      <input
                        v-model.number="literatureTopK"
                        class="ds-input ds-input--narrow"
                        type="number"
                        min="1"
                        max="20"
                        step="1"
                        :disabled="loading"
                      >
                    </label>
                    <label class="ds-field">
                      文献相似度（0=不过滤）
                      <input
                        v-model.number="literatureThreshold"
                        class="ds-input ds-input--narrow"
                        type="number"
                        inputmode="decimal"
                        min="0"
                        max="1"
                        step="0.05"
                        :disabled="loading"
                      >
                    </label>
                  </div>
                </div>
              </details>
            </div>
          </div>
        </div>
      </div>
      <p
        v-if="exportHint"
        class="ds-hint consult-export-hint"
        role="status"
      >
        {{ exportHint }}
      </p>
    </header>

    <DsAlert
      v-if="error"
      variant="error"
      class="consult-alert"
    >
      {{ error }}
    </DsAlert>
    <p
      v-if="loading && orchestrationLabel"
      class="consult-orchestration"
      role="status"
      aria-live="polite"
    >
      <span class="consult-orchestration__main">
        <span
          class="consult-orchestration__spin"
          aria-hidden="true"
        >{{ spinChar }}</span>
        <span
          v-if="orchestrationStep != null"
          class="consult-orchestration__step"
        >{{ orchestrationStep }}</span>
        <span class="consult-orchestration__title">{{ orchestrationLabel }}</span>
      </span>
      <span
        v-if="orchestrationDetail"
        class="consult-orchestration__detail"
      >{{ orchestrationDetail }}</span>
    </p>
    <details
      v-if="streamActivityLog.length > 0"
      class="consult-activity-trace"
    >
      <summary class="consult-activity-trace__summary">
        编排追踪（claw-code 式阶段事件）
      </summary>
      <ol class="consult-activity-trace__list">
        <li
          v-for="(e, i) in streamActivityLog"
          :key="`${e.ts}-${i}`"
          class="consult-activity-trace__item"
          :class="{
            'consult-activity-trace__item--tool': e.phase.startsWith('tool:'),
          }"
        >
          <span
            v-if="e.step != null"
            class="consult-activity-trace__step"
          >{{ e.step }}</span>
          <code class="consult-activity-trace__phase">{{ e.phase || '—' }}</code>
          <span class="consult-activity-trace__label">{{ e.label }}</span>
          <span
            v-if="e.detail"
            class="consult-activity-trace__detail"
          >{{ e.detail }}</span>
        </li>
      </ol>
    </details>
    <p
      v-if="ragMeta && !(loading && streamingContent)"
      class="ds-hint consult-rag-meta"
    >
      <template v-if="ragMeta.agentMode === 'react+tools'">
        本回合 Agent 工具链已运行（{{ ragMeta.agentMode }}）。工具侧约
        {{ ragMeta.retrievedChunks }} 条命中<span
          v-if="ragMeta.sources.length"
        >；合并来源：{{ ragMeta.sources.join('、') }}</span>。
      </template>
      <template v-else-if="ragMeta.literatureCollectionId">
        本回合已关联文献库（ID {{ ragMeta.literatureCollectionId }}），检索到
        {{ ragMeta.retrievedChunks }} 条相关片段<span
          v-if="ragMeta.sources.length"
        >；来源：{{ ragMeta.sources.join('、') }}</span>。
      </template>
      <template v-else-if="ragMeta.knowledgeBaseId != null">
        本回合已关联知识库 #{{ ragMeta.knowledgeBaseId }}，检索到
        {{ ragMeta.retrievedChunks }} 条相关片段<span
          v-if="ragMeta.sources.length"
        >；来源：{{ ragMeta.sources.join('、') }}</span>。
      </template>
      <template v-else>
        检索到 {{ ragMeta.retrievedChunks }} 条相关片段<span
          v-if="ragMeta.sources.length"
        >；来源：{{ ragMeta.sources.join('、') }}</span>。
      </template>
    </p>

    <div
      ref="threadEl"
      class="ds-thread consult-thread"
      role="region"
      aria-label="对话内容"
    >
      <div class="consult-doc-stream">
        <div
          v-if="messages.length === 0 && !loading && !streamingContent"
          class="ds-thread-empty"
        >
          <p class="ds-thread-empty__title">
            开始一次问诊
          </p>
          <p class="ds-thread-empty__hint">
            Enter 发送。输入区旁可附药材 / 舌象图（走识图工具）；右上角可设置可选默认知识库与文献库。
          </p>
        </div>
        <ChatDocMessage
          v-for="(m, i) in messages"
          :key="i"
          :role="m.role"
          :content="m.content"
          :allow-regenerate="
            m.role === 'assistant' &&
              i === messages.length - 1 &&
              !loading
          "
          @regenerate="onRegenerateAssistant"
        />
        <ChatDocMessage
          v-if="loading"
          role="assistant"
          :content="streamingContent"
          :rag-log="streamingRagLog"
          :is-streaming="true"
          :stream-vision="false"
          :allow-regenerate="false"
        />
      </div>
    </div>

    <form
      class="consult-composer"
      @submit.prevent="onSend"
    >
      <div
        v-if="pendingImages.length > 0"
        class="consult-attachments"
      >
        <span
          v-for="(f, idx) in pendingImages"
          :key="idx + f.name"
          class="consult-attachments__chip"
        >
          {{ f.name }}
          <button
            type="button"
            class="consult-attachments__x"
            :disabled="loading"
            @click="removeImageAt(idx)"
          >
            ×
          </button>
        </span>
        <span
          v-if="pendingImages.length > 1"
          class="ds-hint"
        >将使用第一张图调用接口</span>
      </div>
      <div class="consult-composer__shell">
        <input
          ref="attachInput"
          type="file"
          class="consult-composer__file"
          accept="image/*"
          multiple
          :disabled="loading"
          @change="onAttachChange"
        >
        <button
          type="button"
          class="ds-btn ds-btn--icon ds-btn--subtle consult-composer__attach"
          :disabled="loading"
          title="上传图片（可选，走药材识图工具）"
          aria-label="上传附件或图片"
          @click="onAttachClick"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="1.8"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3A1.5 1.5 0 0 0 1.5 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008H12V8.25Z"
            />
          </svg>
        </button>
        <textarea
          v-model="input"
          class="consult-composer__input"
          rows="3"
          placeholder="描述症状、上传处方图说明、或基于文献提问…"
          :disabled="loading"
          @keydown.enter.exact.prevent="onSend"
        />
        <button
          type="submit"
          class="ds-btn ds-btn--primary ds-btn--icon consult-composer__send"
          :disabled="!canSend()"
          aria-label="发送"
          title="发送"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="2"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5"
            />
          </svg>
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.consult-chat {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
  background: transparent;
}

.consult-orchestration {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.28rem;
  margin: 0 0 0.5rem;
  padding: 0.4rem 0.65rem;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-muted);
  background: rgba(99, 102, 241, 0.07);
  border-radius: 0.45rem;
  border: 1px solid rgba(99, 102, 241, 0.15);
}

.consult-orchestration__main {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
}

.consult-orchestration__title {
  min-width: 0;
}

.consult-orchestration__step {
  flex-shrink: 0;
  min-width: 1.25rem;
  padding: 0.08rem 0.35rem;
  font-size: 0.6875rem;
  font-weight: 600;
  line-height: 1.2;
  color: var(--color-primary);
  background: rgba(99, 102, 241, 0.14);
  border-radius: 0.3rem;
}

.consult-orchestration__detail {
  margin: 0;
  padding-left: calc(1rem + 0.45rem);
  font-size: 0.75rem;
  font-weight: 400;
  line-height: 1.45;
  color: var(--color-muted);
  opacity: 0.92;
  word-break: break-word;
}

.consult-orchestration__spin {
  display: inline-block;
  flex-shrink: 0;
  width: 1rem;
  text-align: center;
  font-family: ui-monospace, monospace;
  color: var(--color-primary-hover);
}

.consult-activity-trace {
  margin: 0 0 0.5rem;
  padding: 0.35rem 0.5rem;
  font-size: 0.75rem;
  color: var(--color-muted);
  background: rgba(15, 23, 42, 0.04);
  border-radius: 0.4rem;
  border: 1px solid rgba(99, 102, 241, 0.12);
}

.consult-activity-trace__summary {
  cursor: pointer;
  font-weight: 600;
  color: var(--color-text);
  list-style: none;
}

.consult-activity-trace__summary::-webkit-details-marker {
  display: none;
}

.consult-activity-trace__list {
  margin: 0.4rem 0 0;
  padding-left: 1.15rem;
}

.consult-activity-trace__item {
  margin-bottom: 0.28rem;
  line-height: 1.4;
  word-break: break-word;
}

.consult-activity-trace__item--tool {
  padding-left: 0.15rem;
  border-left: 2px solid rgba(34, 197, 94, 0.55);
}

.consult-activity-trace__step {
  display: inline-block;
  margin-right: 0.35rem;
  padding: 0 0.28rem;
  font-size: 0.65rem;
  font-weight: 600;
  color: var(--color-primary);
  background: rgba(99, 102, 241, 0.12);
  border-radius: 0.25rem;
  vertical-align: middle;
}

.consult-activity-trace__phase {
  margin-right: 0.35rem;
  padding: 0.06rem 0.28rem;
  font-size: 0.68rem;
  background: rgba(99, 102, 241, 0.08);
  border-radius: 0.25rem;
}

.consult-activity-trace__label {
  font-weight: 500;
  color: var(--color-text);
}

.consult-activity-trace__detail {
  display: block;
  margin-top: 0.12rem;
  margin-left: 0;
  padding-left: 0.15rem;
  opacity: 0.88;
  font-weight: 400;
}

.consult-header {
  flex-shrink: 0;
  margin-bottom: 0.35rem;
}

.consult-header__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.consult-header__main {
  min-width: 0;
  flex: 1;
  text-align: left;
}

.consult-header__title {
  margin: 0;
  font-size: 1.15rem;
  line-height: 1.35;
}

.consult-header__status {
  margin: 0.35rem 0 0;
  width: fit-content;
  max-width: 100%;
}

.consult-header__side {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 0.35rem;
  flex-shrink: 0;
}

.consult-export-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem;
}

.consult-export__btn {
  font-size: 0.82rem;
  padding: 0.35rem 0.55rem;
}

.consult-export-hint {
  margin: 0.5rem 0 0;
  width: 100%;
}

.consult-settings {
  position: relative;
}

.consult-settings__trigger {
  min-width: var(--ds-control-height);
}

.consult-settings__panel {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 40;
  width: min(calc(100vw - 1.5rem), 24rem);
  max-height: min(72vh, 34rem);
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0.85rem;
  box-sizing: border-box;
  background: var(--color-surface);
  border: 1px solid var(--color-border-neutral);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-dropdown);
}

.consult-settings__panel .omni-select {
  max-width: 100%;
}

.omni-bar--panel {
  margin: 0 0 0.75rem;
}

.consult-adv--panel {
  margin: 0;
}

.consult-adv--panel .consult-adv__body {
  margin-top: 0.35rem;
  padding-top: 0.45rem;
  border-top: 1px dashed var(--color-border-neutral);
}

.omni-segmented {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.2rem;
  padding: 0.25rem;
  border-radius: 0.65rem;
  background: var(--color-border-subtle);
  border: 1px solid var(--color-border-neutral);
}

.omni-segment {
  flex: 1 1 auto;
  min-width: fit-content;
  font-size: 0.75rem;
  font-weight: 500;
  padding: 0.4rem 0.7rem;
  border: none;
  border-radius: 0.5rem;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  touch-action: manipulation;
  transition: var(--transition-fast), color 0.15s ease, box-shadow 0.15s ease,
    background 0.15s ease, transform 0.1s cubic-bezier(0.33, 1, 0.68, 1);
}

.omni-segment:hover:not(:disabled) {
  color: var(--color-primary-hover);
}

.omni-segment:active:not(:disabled) {
  transform: scale(0.96);
}

.omni-segment:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.omni-segment:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.omni-segment--active {
  background: var(--color-surface, #fff);
  color: var(--color-primary-hover);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08), 0 1px 2px rgba(15, 23, 42, 0.06);
}

.omni-bar {
  margin: 0.35rem 0 0.2rem;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5rem;
}

.omni-bar__label {
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-muted);
}

.omni-bar__mount {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.65rem;
  width: 100%;
}

.omni-bar__mount--wrap {
  flex-direction: column;
  align-items: flex-start;
}

.omni-mount-label {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}

.omni-select {
  min-width: 12rem;
  max-width: min(100%, 22rem);
}

.omni-hint {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--color-muted);
}

.omni-vision-note {
  margin: 0;
  font-size: 0.75rem;
  color: var(--color-muted);
  max-width: 40rem;
}

.omni-vision-note--compact {
  margin-bottom: 0.5rem;
}

.omni-check {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8125rem;
  cursor: pointer;
  touch-action: manipulation;
  transition: opacity 0.12s ease;
}

.omni-check:active {
  opacity: 0.78;
}

.omni-refresh {
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
}

.consult-header__stop {
  font-size: 0.8125rem;
  padding-left: 0.75rem;
  padding-right: 0.75rem;
}

.consult-adv {
  margin: 0;
  margin-top: 0.1rem;
  padding: 0;
  border: none;
  background: transparent;
}

.consult-adv__summary {
  list-style: none;
  cursor: pointer;
  width: fit-content;
  max-width: 100%;
  margin: 0;
  padding: 0.1rem 0.25rem;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--color-muted);
  border: none;
  background: transparent;
  touch-action: manipulation;
  border-radius: var(--radius-sm);
  transition: color 0.15s ease, transform 0.1s ease, background-color 0.15s ease;
}

.consult-adv__summary::-webkit-details-marker {
  display: none;
}

.consult-adv__summary::after {
  content: ' ▾';
  font-size: 0.65rem;
  opacity: 0.8;
}

.consult-adv[open] > .consult-adv__summary {
  color: var(--color-text-secondary);
}

.consult-adv__summary:hover {
  color: var(--color-primary-hover);
}

.consult-adv__summary:active {
  transform: scale(0.98);
  background: rgba(124, 58, 237, 0.06);
}

.consult-adv__summary:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.consult-adv__body {
  margin-top: 0.35rem;
  padding-top: 0.4rem;
  border-top: 1px dashed var(--color-border);
}

.consult-slider-intro {
  margin: 0 0 0.65rem;
  max-width: min(100%, 36rem);
}

.consult-slider-grid {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  margin-bottom: 0.75rem;
  max-width: min(100%, 26rem);
}

.consult-slider-item__label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-bottom: 0.3rem;
}

.consult-el-slider {
  width: 100%;
}

.consult-controls--rag {
  margin-top: 0.15rem;
}

.consult-adv__select {
  min-width: 10rem;
  max-width: min(100%, 20rem);
}

.consult-controls {
  margin-top: 0;
}

.consult-controls--wrap {
  flex-wrap: wrap;
}

.consult-rag-meta {
  margin-top: 0.25rem;
  margin-bottom: 0;
  font-size: 0.8125rem;
}

.consult-alert {
  margin: 0.5rem 0 0.35rem;
  max-width: min(100%, 40rem);
}

.consult-thread {
  flex: 1;
  min-height: 0;
}

.consult-doc-stream {
  width: 100%;
  max-width: 48rem;
  margin: 0 auto;
  padding: 0 0.35rem 1.5rem;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  flex: 1;
  min-height: 0;
}

.consult-composer {
  margin-top: 1.25rem;
  padding-top: 0.25rem;
  flex-shrink: 0;
}

.consult-attachments {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.4rem;
}

.consult-attachments__chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  padding: 0.2rem 0.45rem;
  border-radius: var(--radius-sm);
  background: rgba(124, 58, 237, 0.08);
  border: 1px solid var(--color-border);
}

.consult-attachments__x {
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 0 0.15rem;
  line-height: 1;
  color: var(--color-muted);
  touch-action: manipulation;
  border-radius: var(--radius-sm);
  transition: transform 0.1s ease, color 0.15s ease;
}

.consult-attachments__x:hover:not(:disabled) {
  color: var(--color-danger);
}

.consult-attachments__x:active:not(:disabled) {
  transform: scale(0.9);
}

.consult-attachments__x:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.consult-composer__shell {
  position: relative;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  transition: var(--transition-fast);
  overflow: hidden;
}

.consult-composer__shell:focus-within {
  border-color: var(--color-secondary);
  box-shadow: var(--focus-ring);
}

.consult-composer__file {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}

.consult-composer__attach {
  position: absolute;
  bottom: 0.65rem;
  left: 0.55rem;
  z-index: 1;
  width: var(--ds-control-height);
  height: var(--ds-control-height);
  min-width: var(--ds-control-height);
  padding: 0;
  border-radius: var(--radius-control);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.consult-composer__input {
  display: block;
  width: 100%;
  margin: 0;
  box-sizing: border-box;
  padding: 12px 60px 12px 52px;
  min-height: 5.25rem;
  font-family: var(--font-body);
  font-size: 0.9375rem;
  line-height: 1.5;
  color: var(--color-text);
  background: var(--color-surface);
  border: none;
  border-radius: var(--radius-md);
  outline: none;
  resize: none !important;
  overflow-y: auto;
}

.consult-composer__input::-webkit-resizer {
  display: none;
  appearance: none;
}

.consult-composer__input::placeholder {
  color: var(--color-muted);
}

.consult-composer__input:focus {
  outline: none;
}

.consult-composer__send {
  position: absolute;
  bottom: 0.65rem;
  right: 0.65rem;
  width: var(--ds-control-height);
  height: var(--ds-control-height);
  border-radius: var(--radius-control);
}

@media (max-width: 52rem) {
  .consult-header__top {
    flex-direction: column;
    align-items: stretch;
  }

  .consult-header__side {
    justify-content: space-between;
  }
}
</style>

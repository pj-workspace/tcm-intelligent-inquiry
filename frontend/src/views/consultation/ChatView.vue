<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue'
import { silentAxiosConfig } from '@/api/core/client'
import { getErrorMessage } from '@/api/core/errors'
import { getConsultationHealth } from '@/api/modules/consultation'
import type { SendOptions } from '@/composables/useChat'
import ChatInputBox, {
  type ChatInputSendPayload,
} from '@/views/consultation/components/ChatInputBox.vue'
import ChatSettingsDrawer from '@/views/consultation/components/ChatSettingsDrawer.vue'
import ChatThread from '@/views/consultation/components/ChatThread.vue'
import { useChatExport } from '@/views/consultation/composables/useChatExport'
import { useConsultChatPrefs } from '@/composables/useConsultChatPrefs'
import { useOmniChatContext } from '@/composables/useOmniChatContext'
import { formatHealthStatus, isHealthStatusErr } from '@/utils/formatHealthStatus'
import { encodeImageFileToHerbPayload } from '@/utils/herbImagePayload'
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
  streamingDiagnosisReport,
  streamingHerbSafety,
  ragMeta,
  streamPhase,
  streamActivityLog,
  send,
  stop,
} = chat

/** 默认知识库 / 文献库：与 ChatSettingsDrawer 共享单例，供 buildSendOptions 注入请求 */
const { knowledgeBaseId, literatureCollectionId } = useOmniChatContext()

const health = ref<string>('')
const chatThreadRef = ref<InstanceType<typeof ChatThread> | null>(null)
const chatInputBoxRef = ref<InstanceType<typeof ChatInputBox> | null>(null)

/** 模型参数、RAG 数值：与 ChatSettingsDrawer 共享单例 composable，见 useConsultChatPrefs */
const {
  temperature,
  topP,
  maxHistoryTurns,
  ragTopK,
  ragSimilarityThreshold,
  literatureTopK,
  literatureThreshold,
  settingsOpen,
} = useConsultChatPrefs()

const currentSessionTitle = computed(() => {
  const id = sessionId.value
  if (id == null) return '问诊记录'
  return sessions.value.find((s) => s.id === id)?.title ?? `会话 #${id}`
})

const { exportMd, exportPdf, exportHint, exportBusy } = useChatExport({
  sessionTitle: currentSessionTitle,
  messages,
  loading,
  streamingContent,
})

onMounted(async () => {
  try {
    const { data } = await getConsultationHealth(silentAxiosConfig)
    const line = formatHealthStatus(data.code, data.message ?? '')
    health.value = isHealthStatusErr(line) ? line : ''
  } catch (e) {
    health.value = `后端不可用: ${getErrorMessage(e)}`
  }
})

function buildSendOptions(skipAppendUser = false): SendOptions {
  const lit =
    literatureCollectionId.value.trim() === ''
      ? null
      : literatureCollectionId.value.trim()
  const opts: SendOptions = {
    temperature: temperature.value,
    topP: topP.value,
    maxHistoryTurns: maxHistoryTurns.value,
    scrollRoot: chatThreadRef.value?.getScrollRoot() ?? null,
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

async function handleSendMessage({ text, images }: ChatInputSendPayload) {
  if (!text.trim() || loading.value) return

  const files = [...images]
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
  if (!error.value) chatInputBoxRef.value?.clearPendingImages()
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
              @click="exportMd"
            >
              导出 Markdown
            </button>
            <button
              type="button"
              class="ds-btn ds-btn--ghost consult-export__btn"
              :disabled="loading || exportBusy"
              @click="exportPdf"
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
          <button
            type="button"
            class="ds-btn ds-btn--icon ds-btn--subtle consult-settings__trigger"
            :aria-expanded="settingsOpen"
            aria-label="问诊设置：默认挂载与模型参数"
            title="问诊设置"
            @click="settingsOpen = true"
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

    <ChatThread
      ref="chatThreadRef"
      :messages="messages"
      :loading="loading"
      :streaming-content="streamingContent"
      :streaming-diagnosis-report="streamingDiagnosisReport"
      :streaming-herb-safety="streamingHerbSafety"
      :rag-meta="ragMeta"
      :stream-phase="streamPhase"
      :stream-activity-log="streamActivityLog"
      :error="error"
      @regenerate="onRegenerateAssistant"
    />

    <ChatInputBox
      ref="chatInputBoxRef"
      :loading="loading"
      @send="handleSendMessage"
    />

    <ChatSettingsDrawer
      v-model:visible="settingsOpen"
      :loading="loading"
    />
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

.consult-settings__trigger {
  min-width: var(--ds-control-height);
}

.consult-header__stop {
  font-size: 0.8125rem;
  padding-left: 0.75rem;
  padding-right: 0.75rem;
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

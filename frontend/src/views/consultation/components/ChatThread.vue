<script setup lang="ts">
import { computed, nextTick, ref, toRef, watch } from 'vue'
import type {
  ChatTurn,
  ConsultationRagMeta,
  StreamActivityEntry,
  StreamPhasePayload,
} from '@/composables/useChat'
import type { KnowledgeRetrievedPassage } from '@/types/knowledge'
import ChatDocMessage from '@/components/business/ChatDocMessage.vue'
import DsAlert from '@/components/common/DsAlert.vue'
import ConsultationToolTerminal from '@/views/consultation/components/ConsultationToolTerminal.vue'
import { useBrailleSpinner } from '@/composables/useBrailleSpinner'

const props = defineProps<{
  messages: ChatTurn[]
  loading: boolean
  streamingContent: string
  streamingRetrievalPassages: KnowledgeRetrievedPassage[]
  ragMeta: ConsultationRagMeta | null
  streamPhase: StreamPhasePayload | null
  streamActivityLog: StreamActivityEntry[]
  error: string | null
}>()

const emit = defineEmits<{
  regenerate: []
}>()

const { spinChar } = useBrailleSpinner(toRef(props, 'loading'))

const orchestrationLabel = computed(() => {
  if (!props.loading) return ''
  const server = props.streamPhase?.label?.trim()
  if (server) return server
  const stream = props.streamingContent.trim()
  if (!stream) return '连接本地大模型…'
  return '模型流式输出中…'
})

const orchestrationDetail = computed(() => {
  if (!props.loading) return ''
  const d = props.streamPhase?.detail?.trim()
  return d ?? ''
})

const orchestrationStep = computed(() => {
  const s = props.streamPhase?.step
  if (typeof s !== 'number' || !Number.isFinite(s)) return null
  return Math.max(1, Math.floor(s))
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
  if (meta.passages?.length) {
    lines.push(`溯源摘录：${meta.passages.length} 条`)
  }
  return lines.join('\n')
}

const lastUserBubble = computed(() => {
  for (let i = props.messages.length - 1; i >= 0; i--) {
    if (props.messages[i].role === 'user') return props.messages[i].content
  }
  return ''
})

const streamingRagLog = computed(() => {
  if (!props.loading || !props.streamingContent) return null
  return formatRagLog(props.ragMeta)
})

const threadScrollRoot = ref<HTMLElement | null>(null)
/** 用户手动上滑时暂停自动粘底，靠近底部或新发送时恢复 */
const userPinnedToBottom = ref(true)
const SCROLL_PIN_THRESHOLD_PX = 120

function onThreadScroll() {
  const el = threadScrollRoot.value
  if (!el) return
  const dist = el.scrollHeight - el.scrollTop - el.clientHeight
  userPinnedToBottom.value = dist < SCROLL_PIN_THRESHOLD_PX
}

function scrollToBottomIfPinned() {
  nextTick(() => {
    const el = threadScrollRoot.value
    if (!el) return
    if (!userPinnedToBottom.value && !props.loading) return
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight
    if (!props.loading && dist > SCROLL_PIN_THRESHOLD_PX * 1.5) return
    try {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    } catch {
      el.scrollTop = el.scrollHeight
    }
  })
}

watch(
  () => props.loading,
  (loading) => {
    if (loading) userPinnedToBottom.value = true
  }
)

watch(
  () =>
    [
      props.messages.length,
      props.streamingContent,
      props.loading,
    ] as const,
  () => scrollToBottomIfPinned(),
  { flush: 'post' }
)

defineExpose({
  /** 供父组件 buildSendOptions.scrollRoot 在发送时传入 useChat */
  getScrollRoot: () => threadScrollRoot.value,
})
</script>

<template>
  <div class="chat-thread">
    <DsAlert
      v-if="error"
      variant="error"
      class="consult-alert"
    >
      {{ error }}
    </DsAlert>
    <ConsultationToolTerminal
      :entries="streamActivityLog"
      :active="loading"
    />
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
      ref="threadScrollRoot"
      class="ds-thread consult-thread consult-thread--grid"
      role="region"
      aria-label="对话内容"
      @scroll.passive="onThreadScroll"
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
            Enter 发送，Shift+Enter 换行。输入区旁可附药材 / 舌象图（走识图工具）；右上角可设置可选默认知识库与文献库。
          </p>
        </div>
        <ChatDocMessage
          v-for="(m, i) in messages"
          :key="i"
          :role="m.role"
          :content="m.content"
          :retrieval-passages="m.role === 'assistant' ? m.retrievalPassages : undefined"
          :trace-user-query="
            m.role === 'assistant' &&
              i > 0 &&
              messages[i - 1]?.role === 'user'
              ? messages[i - 1].content
              : undefined
          "
          :allow-regenerate="
            m.role === 'assistant' &&
              i === messages.length - 1 &&
              !loading
          "
          @regenerate="emit('regenerate')"
        />
        <ChatDocMessage
          v-if="loading"
          role="assistant"
          :content="streamingContent"
          :retrieval-passages="
            streamingRetrievalPassages.length ? streamingRetrievalPassages : undefined
          "
          :trace-user-query="lastUserBubble"
          :rag-log="streamingRagLog"
          :is-streaming="true"
          :stream-vision="false"
          :allow-regenerate="false"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-thread {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
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

.consult-thread--grid {
  background-color: var(--color-surface);
  background-image:
    linear-gradient(to right, rgba(124, 58, 237, 0.045) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(124, 58, 237, 0.045) 1px, transparent 1px);
  background-size: 24px 24px;
  background-position: 0 0;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border-subtle);
}

html.dark .consult-thread--grid {
  background-image:
    linear-gradient(to right, rgba(167, 139, 250, 0.08) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(167, 139, 250, 0.08) 1px, transparent 1px);
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
</style>

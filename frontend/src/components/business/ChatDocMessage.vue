<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import MarkdownContent from '@/components/business/MarkdownContent.vue'
import { splitThinkFromAssistant } from '@/utils/splitThink'

const props = withDefaults(
  defineProps<{
    role: 'user' | 'assistant'
    content: string
    /** 当前流式回合的 RAG / 文献检索摘要（与模型推理一同收入折叠区） */
    ragLog?: string | null
    /** 是否显示「重新生成」（由父级控制：仅末尾助手且非流式等） */
    allowRegenerate?: boolean
    /** 当前是否处于等待首 token / 流式输出中（用于占位与动画） */
    isStreaming?: boolean
    /** 视觉模式下的占位文案（isStreaming 时） */
    streamVision?: boolean
  }>(),
  { ragLog: null, allowRegenerate: false, isStreaming: false, streamVision: false }
)

const emit = defineEmits<{
  regenerate: []
}>()

const feedback = ref<'up' | 'down' | null>(null)
const copyOk = ref(false)
let copyTimer: ReturnType<typeof setTimeout> | null = null

const parsed = computed(() =>
  props.role === 'assistant' ? splitThinkFromAssistant(props.content) : null
)

const ragTrim = computed(() => (props.ragLog ?? '').trim())

const showThinkPanel = computed(() => {
  if (props.role !== 'assistant' || !parsed.value) return false
  const p = parsed.value
  return !!(p.think || p.thinkIncomplete || ragTrim.value)
})

const thinkPanelOpen = computed(() => parsed.value?.thinkIncomplete ?? false)

const copyPlain = computed(
  () => (parsed.value?.rest ?? (props.role === 'assistant' ? props.content : '')).trim()
)

const showAssistantActions = computed(
  () =>
    props.role === 'assistant' &&
    !props.isStreaming &&
    (!!copyPlain.value || props.allowRegenerate)
)

/** 尚无正文输出时，在文档流内展示「思考」占位（首包等待或仅推理阶段之后） */
const showStreamingPlaceholder = computed(() => {
  if (props.role !== 'assistant' || !props.isStreaming) return false
  const p = parsed.value
  if (!p) return true
  if (p.thinkIncomplete) return false
  if (p.rest.trim()) return false
  return true
})

const pendingLabel = computed(() =>
  props.streamVision ? '视觉模型处理中' : '助手思考中'
)

const assistantBusy = computed(
  () =>
    props.role === 'assistant' &&
    props.isStreaming &&
    (showStreamingPlaceholder.value || !!parsed.value?.thinkIncomplete)
)

async function copyAnswer() {
  if (!copyPlain.value) return
  try {
    await navigator.clipboard.writeText(copyPlain.value)
    copyOk.value = true
    if (copyTimer) clearTimeout(copyTimer)
    copyTimer = setTimeout(() => {
      copyOk.value = false
      copyTimer = null
    }, 2000)
  } catch {
    /* 静默失败；部分环境无剪贴板权限 */
  }
}

function toggleFeedback(v: 'up' | 'down') {
  feedback.value = feedback.value === v ? null : v
}

function onRegenerate() {
  if (!props.allowRegenerate) return
  emit('regenerate')
}

onUnmounted(() => {
  if (copyTimer) clearTimeout(copyTimer)
})
</script>

<template>
  <!-- 用户：右侧圆角块，无头像 -->
  <div
    v-if="role === 'user'"
    class="chat-doc-user"
  >
    <div class="chat-doc-user__bubble">
      <p class="chat-doc-user__text">
        {{ content }}
      </p>
    </div>
  </div>

  <!-- 助手：无气泡，文档流 + 可选推理折叠 -->
  <article
    v-else
    class="chat-doc-assistant"
    aria-label="助手回复"
  >
    <div class="chat-doc-assistant__toolbar">
      <span
        class="chat-doc-assistant__mark"
        :class="{ 'chat-doc-assistant__mark--busy': assistantBusy }"
        title="助手"
        aria-hidden="true"
      >
        <svg
          class="chat-doc-assistant__spark"
          xmlns="http://www.w3.org/2000/svg"
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
        >
          <path
            d="M12 2L13.2 8.2L19 9.5L13.2 10.8L12 17L10.8 10.8L5 9.5L10.8 8.2L12 2Z"
            fill="currentColor"
            opacity="0.95"
          />
          <path
            d="M18.5 14L19 16L21 16.5L19 17L18.5 19L18 17L16 16.5L18 16L18.5 14Z"
            fill="currentColor"
            opacity="0.7"
          />
        </svg>
      </span>
      <details
        v-if="showThinkPanel && parsed"
        class="chat-doc-think"
        :open="thinkPanelOpen"
      >
        <summary
          class="chat-doc-think__summary"
          :class="{ 'chat-doc-think__summary--working': parsed?.thinkIncomplete }"
        >
          <svg
            class="chat-doc-think__chev"
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M2.5 4.5L6 8L9.5 4.5"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <span class="chat-doc-think__label">{{
            parsed.thinkIncomplete ? '推理中…' : '显示思路'
          }}</span>
        </summary>
        <div class="chat-doc-think__body">
          <pre
            v-if="parsed.think"
            class="chat-doc-think__pre"
          >{{ parsed.think }}</pre>
          <div
            v-if="ragTrim"
            class="chat-doc-think__rag"
          >
            <span class="chat-doc-think__rag-label">检索 / 上下文</span>
            <pre class="chat-doc-think__pre chat-doc-think__pre--rag">{{ ragLog }}</pre>
          </div>
        </div>
      </details>
    </div>

    <div class="chat-doc-assistant__body">
      <MarkdownContent
        v-if="parsed && parsed.rest.trim()"
        :source="parsed.rest"
      />
      <div
        v-else-if="showStreamingPlaceholder"
        class="chat-doc-pending"
        aria-live="polite"
        aria-busy="true"
      >
        <p class="chat-doc-pending__label">
          <span
            class="chat-doc-pending__dots"
            aria-hidden="true"
          >
            <span />
            <span />
            <span />
          </span>
          <span>{{ pendingLabel }}</span>
        </p>
        <div
          class="chat-doc-pending__shimmer"
          aria-hidden="true"
        >
          <span class="chat-doc-pending__line chat-doc-pending__line--w100" />
          <span class="chat-doc-pending__line chat-doc-pending__line--w92" />
          <span class="chat-doc-pending__line chat-doc-pending__line--w68" />
        </div>
      </div>
      <p
        v-else-if="
          parsed &&
            !parsed.think &&
            !parsed.thinkIncomplete &&
            !parsed.rest.trim()
        "
        class="chat-doc-assistant__empty"
      >
        （无内容）
      </p>
    </div>

    <div
      v-if="showAssistantActions"
      class="chat-doc-assistant__actions"
      aria-label="本条回复操作"
    >
      <button
        type="button"
        class="chat-doc-act"
        :class="{ 'chat-doc-act--on': feedback === 'up' }"
        title="有帮助"
        aria-label="有帮助"
        :aria-pressed="feedback === 'up'"
        @click="toggleFeedback('up')"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M7 10v12M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"
          />
        </svg>
      </button>
      <button
        type="button"
        class="chat-doc-act"
        :class="{ 'chat-doc-act--on': feedback === 'down' }"
        title="需改进"
        aria-label="需改进"
        :aria-pressed="feedback === 'down'"
        @click="toggleFeedback('down')"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M17 14V2M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"
          />
        </svg>
      </button>
      <button
        v-if="allowRegenerate"
        type="button"
        class="chat-doc-act"
        title="重新生成"
        aria-label="重新生成本条回复"
        @click="onRegenerate"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="1.75"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7m0 0L19.5 9.348m-4.992 5.996L19.5 15"
          />
        </svg>
      </button>
      <button
        type="button"
        class="chat-doc-act"
        :title="copyOk ? '已复制' : '复制正文'"
        :aria-label="copyOk ? '已复制' : '复制助手正文'"
        :disabled="!copyPlain"
        @click="copyAnswer"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="1.75"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a3 3 0 0 1-3 3H6.75a3 3 0 0 1-3-3V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"
          />
        </svg>
      </button>
    </div>
  </article>
</template>

<style scoped>
.chat-doc-user {
  display: flex;
  justify-content: flex-end;
  width: 100%;
  margin-bottom: 1.35rem;
}

.chat-doc-user__bubble {
  max-width: min(92%, 36rem);
  padding: 0.65rem 1.05rem;
  border-radius: 1.35rem;
  background: #e5e7eb;
  color: var(--color-text);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
}

.chat-doc-user__text {
  margin: 0;
  font-size: 0.9375rem;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
}

.chat-doc-assistant {
  width: 100%;
  margin-bottom: 0.35rem;
  padding: 0 0 1.35rem;
  border: none;
  background: transparent;
  box-shadow: none;
}

.chat-doc-assistant__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.65rem;
  margin-bottom: 0.5rem;
}

.chat-doc-assistant__mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: #6366f1;
  filter: drop-shadow(0 1px 1px rgba(99, 102, 241, 0.25));
}

.chat-doc-assistant__spark {
  display: block;
}

.chat-doc-assistant__mark--busy {
  color: var(--color-primary-hover);
}

.chat-doc-assistant__mark--busy .chat-doc-assistant__spark {
  animation: chat-doc-spark-pulse 1.35s ease-in-out infinite;
}

@keyframes chat-doc-spark-pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.78;
    transform: scale(1.06);
  }
}

.chat-doc-think__summary--working {
  color: var(--color-primary-hover);
}

.chat-doc-think__summary--working .chat-doc-think__label {
  animation: chat-doc-label-soft 1.1s ease-in-out infinite;
}

@keyframes chat-doc-label-soft {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.62;
  }
}

.chat-doc-pending {
  margin: 0;
  padding: 0.15rem 0 0.35rem;
}

.chat-doc-pending__label {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin: 0 0 0.65rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-muted);
}

.chat-doc-pending__dots {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
}

.chat-doc-pending__dots > span {
  width: 0.28rem;
  height: 0.28rem;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.55;
  animation: chat-doc-dot-bounce 1.05s ease-in-out infinite;
}

.chat-doc-pending__dots > span:nth-child(2) {
  animation-delay: 0.12s;
}

.chat-doc-pending__dots > span:nth-child(3) {
  animation-delay: 0.24s;
}

@keyframes chat-doc-dot-bounce {
  0%,
  80%,
  100% {
    transform: translateY(0);
    opacity: 0.55;
  }
  40% {
    transform: translateY(-0.28rem);
    opacity: 1;
  }
}

.chat-doc-pending__shimmer {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.chat-doc-pending__line {
  display: block;
  height: 0.62rem;
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    rgba(148, 163, 184, 0.16) 0%,
    rgba(148, 163, 184, 0.4) 45%,
    rgba(148, 163, 184, 0.16) 100%
  );
  background-size: 200% 100%;
  animation: chat-doc-shimmer-slide 1.25s ease-in-out infinite;
}

.chat-doc-pending__line--w100 {
  width: 100%;
}

.chat-doc-pending__line--w92 {
  width: 92%;
}

.chat-doc-pending__line--w68 {
  width: 68%;
}

.chat-doc-pending__line:nth-child(2) {
  animation-delay: 0.15s;
}

.chat-doc-pending__line:nth-child(3) {
  animation-delay: 0.3s;
}

@keyframes chat-doc-shimmer-slide {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: -100% 0;
  }
}

.chat-doc-think {
  flex: 1;
  min-width: 10rem;
  max-width: 100%;
  margin: 0;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
}

.chat-doc-think__summary {
  display: inline-flex;
  align-items: center;
  gap: 0.32rem;
  cursor: pointer;
  list-style: none;
  padding: 0.2rem 0.35rem;
  margin: 0;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-muted);
  user-select: none;
  touch-action: manipulation;
  border-radius: var(--radius-sm);
  transition: background-color 0.15s ease, color 0.15s ease, transform 0.1s ease;
}

.chat-doc-think__summary::-webkit-details-marker {
  display: none;
}

.chat-doc-think__summary:hover {
  background: rgba(124, 58, 237, 0.08);
  color: var(--color-text-secondary);
}

.chat-doc-think__summary:active {
  transform: scale(0.97);
}

.chat-doc-think__summary:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.chat-doc-think__chev {
  flex-shrink: 0;
  color: var(--color-muted);
  transition: transform 0.2s ease;
}

.chat-doc-think[open] > .chat-doc-think__summary .chat-doc-think__chev {
  transform: rotate(180deg);
  color: var(--color-primary-hover);
}

.chat-doc-think__label {
  line-height: 1.3;
}

.chat-doc-think__body {
  margin-top: 0.4rem;
  padding: 0.55rem 0.65rem 0.55rem 0.75rem;
  max-height: 16rem;
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 0, 0, 0.12) transparent;
  border-left: 3px solid rgba(99, 102, 241, 0.45);
  background: rgba(248, 250, 252, 0.9);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
}

.chat-doc-think__body::-webkit-scrollbar {
  width: 6px;
}

.chat-doc-think__body::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.12);
  border-radius: 100px;
}

.chat-doc-think__pre {
  margin: 0 0 0.5rem;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 0.8125rem;
  line-height: 1.55;
  color: var(--color-muted);
  white-space: pre-wrap;
  word-break: break-word;
}

.chat-doc-think__pre:last-child {
  margin-bottom: 0;
}

.chat-doc-think__rag {
  margin-top: 0.35rem;
  padding-top: 0.45rem;
  border-top: 1px dashed var(--color-border-neutral);
}

.chat-doc-think__rag-label {
  display: block;
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-muted);
  margin-bottom: 0.35rem;
}

.chat-doc-assistant__body :deep(.ds-markdown) {
  font-size: 0.9375rem;
  line-height: 1.75;
  color: var(--color-text);
}

.chat-doc-assistant__body :deep(.ds-markdown h1) {
  font-size: 1.25rem;
  margin-top: 1.15em;
}

.chat-doc-assistant__body :deep(.ds-markdown h2) {
  font-size: 1.1rem;
  margin-top: 1em;
}

.chat-doc-assistant__body :deep(.ds-markdown h3) {
  font-size: 1.02rem;
}

.chat-doc-assistant__body :deep(.ds-markdown ul),
.chat-doc-assistant__body :deep(.ds-markdown ol) {
  padding-left: 1.35rem;
}

.chat-doc-assistant__body :deep(.ds-markdown li) {
  margin-bottom: 0.35em;
}

.chat-doc-assistant__empty {
  margin: 0;
  font-size: 0.875rem;
  color: var(--color-muted);
}

.chat-doc-assistant__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.2rem;
  margin-top: 0.85rem;
}

.chat-doc-act {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.125rem;
  height: 2.125rem;
  padding: 0;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-muted);
  cursor: pointer;
  touch-action: manipulation;
  transition:
    background-color 0.15s ease,
    color 0.15s ease,
    transform 0.1s cubic-bezier(0.33, 1, 0.68, 1);
}

.chat-doc-act:hover:not(:disabled) {
  background: rgba(15, 23, 42, 0.06);
  color: var(--color-text-secondary);
}

.chat-doc-act:active:not(:disabled) {
  transform: scale(0.92);
  background: rgba(15, 23, 42, 0.1);
}

.chat-doc-act:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.chat-doc-act:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.chat-doc-act--on {
  color: var(--color-primary-hover);
  background: rgba(124, 58, 237, 0.1);
}

@media (prefers-reduced-motion: reduce) {
  .chat-doc-assistant__mark--busy .chat-doc-assistant__spark,
  .chat-doc-think__summary--working .chat-doc-think__label,
  .chat-doc-pending__dots > span,
  .chat-doc-pending__line {
    animation: none;
  }

  .chat-doc-pending__line {
    background: rgba(148, 163, 184, 0.22);
    background-size: auto;
  }

  .chat-doc-pending__dots > span {
    opacity: 0.85;
  }
}
</style>

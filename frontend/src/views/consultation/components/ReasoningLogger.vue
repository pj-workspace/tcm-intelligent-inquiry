<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    think: string | null
    incomplete: boolean
    ragLog?: string | null
  }>(),
  { ragLog: null }
)

const elapsedSec = ref(0)
let timer: ReturnType<typeof setInterval> | null = null

watch(
  () => props.incomplete,
  (inc) => {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    if (!inc) {
      elapsedSec.value = 0
      return
    }
    const start = Date.now()
    elapsedSec.value = 0
    timer = setInterval(() => {
      elapsedSec.value = Math.floor((Date.now() - start) / 1000)
    }, 400)
  },
  { immediate: true }
)

const charCount = computed(() => (props.think ?? '').replace(/\s/g, '').length)
const ragTrim = computed(() => (props.ragLog ?? '').trim())
const showRag = computed(() => ragTrim.value.length > 0)

onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <details
    class="reasoning-logger"
    :open="incomplete"
  >
    <summary
      class="reasoning-logger__summary"
      :class="{ 'reasoning-logger__summary--live': incomplete }"
    >
      <span
        class="reasoning-logger__pulse"
        aria-hidden="true"
      />
      <span class="reasoning-logger__summary-text">
        <template v-if="incomplete">
          <span class="reasoning-logger__live-label">AI 正在思考中…</span>
          <span class="reasoning-logger__stats">{{ charCount }} 字 · 已思考 {{ elapsedSec }}s</span>
        </template>
        <template v-else>
          推理过程
          <span
            v-if="think"
            class="reasoning-logger__stats reasoning-logger__stats--idle"
          >{{ charCount }} 字</span>
        </template>
      </span>
      <svg
        class="reasoning-logger__chev"
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
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
    </summary>
    <div class="reasoning-logger__body">
      <pre
        v-if="think"
        class="reasoning-logger__pre"
      >{{ think }}</pre>
      <div
        v-if="showRag"
        class="reasoning-logger__rag"
      >
        <span class="reasoning-logger__rag-label">检索 / 上下文</span>
        <pre class="reasoning-logger__pre reasoning-logger__pre--rag">{{ ragLog }}</pre>
      </div>
    </div>
  </details>
</template>

<style scoped>
.reasoning-logger {
  flex: 1;
  min-width: 10rem;
  max-width: 100%;
  margin: 0;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
}

.reasoning-logger__summary {
  display: flex;
  align-items: center;
  gap: 0.4rem;
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

.reasoning-logger__summary::-webkit-details-marker {
  display: none;
}

.reasoning-logger__summary:hover {
  background: rgba(124, 58, 237, 0.08);
  color: var(--color-text-secondary);
}

.reasoning-logger__summary:active {
  transform: scale(0.98);
}

.reasoning-logger__summary:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.reasoning-logger__summary--live {
  color: var(--color-primary-hover);
}

.reasoning-logger__pulse {
  flex-shrink: 0;
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 50%;
  background: var(--color-cta);
  box-shadow: 0 0 0 2px rgba(5, 150, 105, 0.22);
  animation: reasoning-pulse 1.2s ease-in-out infinite;
}

@keyframes reasoning-pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.65;
    transform: scale(0.92);
  }
}

.reasoning-logger__summary-text {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.35rem 0.65rem;
  min-width: 0;
  flex: 1;
}

.reasoning-logger__live-label {
  background: linear-gradient(
    90deg,
    var(--color-primary-hover),
    var(--color-cta-hover),
    var(--color-primary-hover)
  );
  background-size: 200% auto;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: reasoning-shimmer 2.4s linear infinite;
  font-weight: 600;
}

@keyframes reasoning-shimmer {
  0% {
    background-position: 0% center;
  }
  100% {
    background-position: 200% center;
  }
}

.reasoning-logger__stats {
  font-size: 0.6875rem;
  font-weight: 500;
  color: var(--color-muted);
  font-variant-numeric: tabular-nums;
}

.reasoning-logger__stats--idle {
  font-weight: 400;
}

.reasoning-logger__chev {
  flex-shrink: 0;
  color: var(--color-muted);
  transition: transform 0.2s ease;
}

.reasoning-logger[open] > .reasoning-logger__summary .reasoning-logger__chev {
  transform: rotate(180deg);
  color: var(--color-primary-hover);
}

.reasoning-logger__body {
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

.reasoning-logger__pre {
  margin: 0 0 0.5rem;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 0.8125rem;
  line-height: 1.55;
  color: var(--color-muted);
  white-space: pre-wrap;
  word-break: break-word;
}

.reasoning-logger__pre:last-child {
  margin-bottom: 0;
}

.reasoning-logger__rag {
  margin-top: 0.35rem;
  padding-top: 0.45rem;
  border-top: 1px dashed var(--color-border-neutral);
}

.reasoning-logger__rag-label {
  display: block;
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-muted);
  margin-bottom: 0.35rem;
}

html.dark .reasoning-logger__body {
  background: rgba(30, 41, 59, 0.72);
  border-left-color: rgba(167, 139, 250, 0.5);
}

@media (prefers-reduced-motion: reduce) {
  .reasoning-logger__pulse,
  .reasoning-logger__live-label {
    animation: none;
  }

  .reasoning-logger__live-label {
    color: var(--color-primary-hover);
    background: none;
    -webkit-text-fill-color: unset;
  }

  .reasoning-logger__pulse {
    opacity: 0.85;
  }
}
</style>

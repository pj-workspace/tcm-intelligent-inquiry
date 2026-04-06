<script setup lang="ts">
import { computed } from 'vue'
import type { StreamActivityEntry } from '@/composables/useChat'

const props = defineProps<{
  entries: StreamActivityEntry[]
  /** 当前是否仍在生成（结束后终端条收起） */
  active: boolean
}>()

const lines = computed(() =>
  props.entries.filter((e) => e.phase.startsWith('tool:')).slice(-8)
)

const lastIsRunning = computed(() => {
  const last = lines.value[lines.value.length - 1]
  if (!last) return false
  return last.phase.endsWith(':start')
})
</script>

<template>
  <div
    v-if="active && lines.length > 0"
    class="tool-terminal"
    role="status"
    aria-live="polite"
    aria-label="工具调用状态"
  >
    <div class="tool-terminal__head">
      <span class="tool-terminal__dots">
        <span />
        <span />
        <span />
      </span>
      <span class="tool-terminal__title">agent tools</span>
      <span
        v-if="lastIsRunning"
        class="tool-terminal__live"
      >running</span>
    </div>
    <ul class="tool-terminal__body">
      <li
        v-for="(line, i) in lines"
        :key="`${line.ts}-${i}`"
        class="tool-terminal__line"
      >
        <span
          class="tool-terminal__prompt"
          aria-hidden="true"
        >&gt;</span>
        <span class="tool-terminal__text">
          <span class="tool-terminal__label">{{ line.label }}</span>
          <span
            v-if="line.detail"
            class="tool-terminal__detail"
          >{{ line.detail }}</span>
        </span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.tool-terminal {
  margin: 0 0 0.5rem;
  padding: 0.45rem 0.55rem 0.5rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border-neutral);
  background: var(--color-surface-elevated);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  box-shadow: 0 1px 0 rgba(15, 23, 42, 0.04);
}

.tool-terminal__head {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin-bottom: 0.35rem;
  padding-bottom: 0.28rem;
  border-bottom: 1px solid var(--color-border-subtle);
}

.tool-terminal__dots {
  display: inline-flex;
  gap: 0.2rem;
}

.tool-terminal__dots > span {
  width: 0.38rem;
  height: 0.38rem;
  border-radius: 50%;
  background: var(--color-muted);
  opacity: 0.45;
}

.tool-terminal__dots > span:nth-child(1) {
  background: #f87171;
  opacity: 0.85;
}
.tool-terminal__dots > span:nth-child(2) {
  background: #fbbf24;
  opacity: 0.85;
}
.tool-terminal__dots > span:nth-child(3) {
  background: #34d399;
  opacity: 0.85;
}

.tool-terminal__title {
  font-size: 0.65rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-muted);
}

.tool-terminal__live {
  margin-left: auto;
  font-size: 0.62rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-cta-hover);
  animation: tool-term-blink 1.1s ease-in-out infinite;
}

@keyframes tool-term-blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.45;
  }
}

.tool-terminal__body {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 7.5rem;
  overflow: auto;
  scrollbar-width: thin;
}

.tool-terminal__line {
  display: flex;
  align-items: flex-start;
  gap: 0.35rem;
  font-size: 0.72rem;
  line-height: 1.45;
  margin-bottom: 0.22rem;
  color: var(--color-text-secondary);
}

.tool-terminal__line:last-child {
  margin-bottom: 0;
}

.tool-terminal__prompt {
  flex-shrink: 0;
  color: var(--color-primary-hover);
  font-weight: 600;
  user-select: none;
}

.tool-terminal__text {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.08rem;
}

.tool-terminal__label {
  color: var(--color-text);
  font-weight: 500;
  word-break: break-word;
}

.tool-terminal__detail {
  font-size: 0.68rem;
  color: var(--color-muted);
  white-space: pre-wrap;
  word-break: break-word;
  padding-left: 0.15rem;
  border-left: 2px solid rgba(124, 58, 237, 0.25);
}

@media (prefers-reduced-motion: reduce) {
  .tool-terminal__live {
    animation: none;
  }
}
</style>

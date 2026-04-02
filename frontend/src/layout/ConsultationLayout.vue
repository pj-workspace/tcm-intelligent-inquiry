<script setup lang="ts">
import { onMounted, provide } from 'vue'
import { RouterView } from 'vue-router'
import {
  CONSULTATION_LAST_SESSION_KEY,
  useChat,
} from '@/composables/useChat'
import { getErrorMessage } from '@/api/core/errors'
import { CONSULT_CHAT_KEY } from '@/constants/injectionKeys'

const chat = useChat()
provide(CONSULT_CHAT_KEY, chat)

const {
  sessions,
  sessionId,
  loading,
  error,
  fetchSessions,
  openSession,
  newSession,
  deleteSession,
  stop,
} = chat

function formatSessionTime(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

function onNewChat() {
  if (loading.value) stop()
  newSession().catch((e) => {
    error.value = getErrorMessage(e)
  })
}

async function onPickSession(id: number) {
  if (loading.value) stop()
  if (sessionId.value === id) return
  try {
    await openSession(id)
  } catch (e) {
    error.value = getErrorMessage(e)
  }
}

async function onDeleteSession(id: number, ev: Event) {
  ev.stopPropagation()
  if (!confirm('确定删除此会话及其所有消息？')) return
  try {
    await deleteSession(id)
  } catch (e) {
    error.value = getErrorMessage(e)
  }
}

onMounted(async () => {
  try {
    await fetchSessions()
    const raw = localStorage.getItem(CONSULTATION_LAST_SESSION_KEY)
    const lastId = raw ? parseInt(raw, 10) : NaN
    if (
      Number.isFinite(lastId) &&
      sessions.value.some((s) => s.id === lastId)
    ) {
      await openSession(lastId)
    } else {
      await newSession()
    }
  } catch (e) {
    error.value = getErrorMessage(e)
    try {
      await newSession()
    } catch (e2) {
      error.value = getErrorMessage(e2)
    }
  }
})
</script>

<template>
  <div class="consult-shell">
    <aside
      class="consult-history"
      aria-label="历史会话"
    >
      <div class="consult-history__head">
        <h2 class="consult-history__title">
          历史会话
        </h2>
        <button
          type="button"
          class="ds-btn ds-btn--ghost consult-history__new"
          :disabled="loading"
          @click="onNewChat"
        >
          新建
        </button>
      </div>
      <div
        class="consult-history__scroll"
        role="region"
        aria-label="历史会话列表"
      >
        <ul
          class="consult-history__list"
          role="list"
        >
          <li
            v-if="sessions.length === 0"
            class="consult-history__empty"
          >
            暂无记录，发送消息后将出现在此。
          </li>
          <li
            v-for="s in sessions"
            :key="s.id"
            :class="[
              'consult-history__item',
              sessionId === s.id ? 'consult-history__item--active' : '',
            ]"
          >
            <button
              type="button"
              class="consult-history__pick"
              @click="onPickSession(s.id)"
            >
              <span class="consult-history__item-title">{{ s.title }}</span>
              <span class="consult-history__item-meta">{{
                formatSessionTime(s.updatedAt)
              }}</span>
            </button>
            <button
              type="button"
              class="consult-history__del"
              title="删除会话"
              @click="onDeleteSession(s.id, $event)"
            >
              ×
            </button>
          </li>
        </ul>
      </div>
    </aside>
    <div class="consult-stage">
      <RouterView />
    </div>
  </div>
</template>

<style scoped>
.consult-shell {
  flex: 1;
  min-height: 0;
  display: flex;
  width: 100%;
  align-items: stretch;
  /* 文档流内两列，无任何 fixed / absolute 侧栏 */
}

.consult-history {
  flex: 0 0 260px;
  width: 260px;
  max-width: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  height: 100%;
  min-height: 0;
  padding: 0.65rem 0.75rem;
  border-right: 1px solid var(--color-border);
  background: var(--color-bg);
  /* 故意不用阴影、圆角卡片，避免「悬浮层」观感 */
}

.consult-history__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  flex-shrink: 0;
  margin-bottom: 0.75rem;
  padding-left: 0.45rem;
  padding-bottom: 0.65rem;
  border-bottom: 1px solid var(--color-border);
}

/* 列表区独占剩余高度，仅此处滚动 */
.consult-history__scroll {
  flex: 1;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  margin-right: -0.15rem;
  padding-right: 0.15rem;
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 0, 0, 0.12) transparent;
}

.consult-history__scroll::-webkit-scrollbar {
  width: 6px;
}

.consult-history__scroll::-webkit-scrollbar-track {
  background: transparent;
}

.consult-history__scroll::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.1);
  border-radius: 100px;
}

.consult-history__scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.22);
}

.consult-history__new {
  flex-shrink: 0;
  align-self: center;
  min-height: 0;
  height: auto;
  padding: 0.2rem 0.55rem;
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1.25;
}

.consult-history__title {
  margin: 0;
  flex: 1;
  min-width: 0;
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1.35;
  letter-spacing: 0.02em;
  color: var(--color-text-secondary);
}

.consult-history__list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.consult-history__empty {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  padding: 0.35rem 0.45rem;
}

.consult-history__item {
  display: flex;
  align-items: stretch;
  gap: 0.15rem;
  margin-bottom: 0.35rem;
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: none;
  transition: background-color 0.15s ease;
}

/* 当前会话：更明确的激活态（略深底 + 左侧主题色条） */
.consult-history__item--active {
  background: #ede9fe;
  box-shadow: inset 3px 0 0 var(--color-primary);
}

.consult-history__item--active .consult-history__item-title {
  color: var(--color-primary-hover);
  font-weight: 600;
}

.consult-history__item--active .consult-history__item-meta {
  color: var(--color-text-secondary);
}

/* 非当前项：悬浮时用更浅的过渡底 */
.consult-history__item:not(.consult-history__item--active):hover {
  background: rgba(124, 58, 237, 0.06);
}

.consult-history__pick {
  flex: 1;
  text-align: left;
  padding: 0.4rem 0.45rem;
  border: none;
  background: transparent;
  cursor: pointer;
  font: inherit;
  color: inherit;
  touch-action: manipulation;
  border-radius: var(--radius-sm);
  transition: transform 0.1s ease, background-color 0.15s ease;
}

.consult-history__pick:active {
  transform: scale(0.98);
}

.consult-history__pick:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.consult-history__item-title {
  display: block;
  font-size: 0.8125rem;
  font-weight: 500;
  line-clamp: 2;
  overflow-wrap: anywhere;
}

.consult-history__item-meta {
  display: block;
  font-size: 0.6875rem;
  color: var(--color-muted);
  margin-top: 0.15rem;
}

.consult-history__del {
  flex: 0 0 1.6rem;
  border: none;
  background: transparent;
  color: var(--color-muted);
  cursor: pointer;
  font-size: 1.05rem;
  line-height: 1;
  padding: 0.2rem;
  border-radius: var(--radius-sm);
  touch-action: manipulation;
  transition: transform 0.1s ease, color 0.15s ease, background-color 0.15s ease;
}

.consult-history__del:hover {
  color: var(--color-danger);
  background: var(--color-danger-bg);
}

.consult-history__del:active {
  transform: scale(0.9);
}

.consult-history__del:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.consult-stage {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-bg);
  padding: 0.5rem 1rem 0.85rem;
}

@media (max-width: 52rem) {
  .consult-shell {
    flex-direction: column;
  }

  .consult-history {
    flex: 0 0 auto;
    width: 100%;
    height: auto;
    max-height: 11rem;
    border-right: none;
    border-bottom: 1px solid var(--color-border);
  }

  .consult-history__scroll {
    flex: 1;
    min-height: 0;
  }

  .consult-stage {
    flex: 1;
    min-height: 0;
  }
}
</style>

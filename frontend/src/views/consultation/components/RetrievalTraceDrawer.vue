<script setup lang="ts">
import { computed } from 'vue'
import { ElDrawer, ElTag, ElTimeline, ElTimelineItem } from 'element-plus'
import type { KnowledgeRetrievedPassage } from '@/types/knowledge'
import {
  channelLabel,
  extractQueryHighlightTerms,
  matchTypeLabel,
} from '@/utils/retrievalTrace'

const props = defineProps<{
  modelValue: boolean
  passages: KnowledgeRetrievedPassage[]
  /** 用于提取高亮词的用户问句（通常为本轮用户消息） */
  userQuery?: string | null
}>()

const emit = defineEmits<{
  'update:modelValue': [v: boolean]
}>()

const terms = computed(() => extractQueryHighlightTerms((props.userQuery ?? '').trim()))

function close() {
  emit('update:modelValue', false)
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 在摘录中高亮问句中出现的连续汉字词（与混合检索关键词弱一致）。 */
function highlightExcerpt(text: string): string {
  const raw = text ?? ''
  if (!raw) return ''
  let out = escapeHtml(raw)
  for (const t of terms.value) {
    if (t.length < 2) continue
    try {
      const re = new RegExp(escapeRe(t), 'g')
      out = out.replace(
        re,
        '<mark class="retrieval-trace__mark">$&</mark>'
      )
    } catch {
      /* ignore */
    }
  }
  return out
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function scoreFmt(s: number): string {
  if (!Number.isFinite(s)) return '—'
  return s.toFixed(3)
}
</script>

<template>
  <ElDrawer
    :model-value="modelValue"
    title="RAG 溯源看板"
    direction="ltr"
    size="min(520px, 92vw)"
    class="retrieval-trace-drawer"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template #default>
      <p class="retrieval-trace__hint">
        以下为当前轮次大模型可参阅的检索摘录（与 SSE <code>meta.passages</code> 及历史落库一致）。得分越大表示该路与问句综合相关度越高。
      </p>
      <p
        v-if="!passages.length"
        class="retrieval-trace__empty"
      >
        本回合暂无结构化溯源数据（可能未启用知识库/文献工具，或为旧会话）。
      </p>
      <ElTimeline v-else>
        <ElTimelineItem
          v-for="p in passages"
          :key="`${p.index}-${p.documentId}-${p.source}`"
          :timestamp="`#${p.index} · ${scoreFmt(p.score)}`"
          placement="top"
          hollow
        >
          <div class="retrieval-trace__card">
            <div class="retrieval-trace__meta">
              <ElTag
                size="small"
                type="primary"
                effect="plain"
              >{{ matchTypeLabel(p.matchType) }}</ElTag>
              <ElTag
                size="small"
                type="info"
                effect="plain"
              >{{ channelLabel(p.channel) }}</ElTag>
              <span
                v-if="p.source"
                class="retrieval-trace__src"
              >{{ p.source }}</span>
            </div>
            <div
              class="retrieval-trace__excerpt"
              v-html="highlightExcerpt(p.excerpt ?? '')"
            />
          </div>
        </ElTimelineItem>
      </ElTimeline>
    </template>
    <template #footer>
      <button
        type="button"
        class="retrieval-trace__btn"
        @click="close"
      >
        关闭
      </button>
    </template>
  </ElDrawer>
</template>

<style scoped>
.retrieval-trace__hint {
  margin: 0 0 14px;
  font-size: 0.8125rem;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}

.retrieval-trace__hint code {
  font-size: 0.75rem;
  padding: 0.12rem 0.28rem;
  border-radius: 4px;
  background: rgba(99, 102, 241, 0.1);
}

.retrieval-trace__empty {
  margin: 0;
  color: var(--el-text-color-secondary);
  font-size: 0.875rem;
}

.retrieval-trace__card {
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-blank);
  margin-bottom: 6px;
}

.retrieval-trace__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.retrieval-trace__src {
  font-size: 0.78rem;
  color: var(--el-text-color-secondary);
  word-break: break-all;
}

.retrieval-trace__excerpt {
  font-size: 0.84rem;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--el-text-color-regular);
}

.retrieval-trace__btn {
  padding: 8px 18px;
  border-radius: 8px;
  border: 1px solid var(--el-border-color);
  background: var(--el-bg-color);
  cursor: pointer;
  font-size: 0.875rem;
}

.retrieval-trace__btn:hover {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}
</style>

<style>
.retrieval-trace__excerpt .retrieval-trace__mark {
  background: rgba(250, 204, 21, 0.35);
  padding: 0 2px;
  border-radius: 2px;
}
</style>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { CloseBold, DocumentCopy, FullScreen, Histogram } from '@element-plus/icons-vue'
import { ElButton, ElIcon } from 'element-plus'
import DiagnosisReportCard from '@/views/consultation/components/DiagnosisReportCard.vue'
import RetrievalTraceDrawer from '@/views/consultation/components/RetrievalTraceDrawer.vue'
import type { ArtifactReportVersion } from '@/composables/useChat'
import type { HerbSafetyCheckResult, TcmDiagnosisReport } from '@/types/consultation'
import type { KnowledgeRetrievedPassage } from '@/types/knowledge'

const props = withDefaults(
  defineProps<{
    versions: ArtifactReportVersion[]
    streamingReport: TcmDiagnosisReport | null
    streamingSafety: HerbSafetyCheckResult | null
    loading: boolean
    mobileOpen: boolean
    /** 当前选中版本的溯源（与主线程助手气泡一致时传入） */
    retrievalPassages?: KnowledgeRetrievedPassage[] | null
    traceUserQuery?: string | null
  }>(),
  {
    retrievalPassages: null,
    traceUserQuery: null,
  }
)

const emit = defineEmits<{
  'update:mobileOpen': [open: boolean]
}>()

const fullscreen = ref(false)
const compareOpen = ref(false)
const selectedIdx = ref(0)
const compareA = ref(0)
const compareB = ref(0)
const traceOpen = ref(false)
const copyState = ref<'idle' | 'ok' | 'err'>('idle')

const hasAny = computed(
  () =>
    props.versions.length > 0 ||
    (props.loading && props.streamingReport != null) ||
    props.streamingReport != null
)

watch(
  () => props.versions.length,
  (n) => {
    if (n === 0) {
      selectedIdx.value = 0
      compareA.value = 0
      compareB.value = 0
      return
    }
    selectedIdx.value = n - 1
    compareA.value = Math.max(0, n - 2)
    compareB.value = n - 1
  }
)

const selectedVersion = computed((): ArtifactReportVersion | null => {
  const list = props.versions
  if (list.length === 0) return null
  const i = Math.min(Math.max(0, selectedIdx.value), list.length - 1)
  return list[i] ?? null
})

const panelReport = computed((): TcmDiagnosisReport | null => {
  if (props.loading && props.streamingReport) return props.streamingReport
  if (selectedVersion.value) return selectedVersion.value.report
  if (props.versions.length === 0 && props.streamingReport) {
    return props.streamingReport
  }
  return null
})

const panelSafety = computed((): HerbSafetyCheckResult | null => {
  if (props.loading && props.streamingSafety != null) return props.streamingSafety
  return selectedVersion.value?.herbSafety ?? null
})

const traceEnabled = computed(
  () => (props.retrievalPassages?.length ?? 0) > 0 && panelReport.value != null
)

function versionLabel(v: ArtifactReportVersion, index: number) {
  if (v.at > 1_000_000_000_000) {
    const t = new Date(v.at)
    return `v${index + 1} · ${t.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
  }
  return `v${index + 1}`
}

function closeMobile() {
  emit('update:mobileOpen', false)
}

async function copyJson() {
  const r = panelReport.value
  if (!r) return
  try {
    await navigator.clipboard.writeText(
      JSON.stringify({ report: r, safety: panelSafety.value }, null, 2)
    )
    copyState.value = 'ok'
    setTimeout(() => {
      copyState.value = 'idle'
    }, 1600)
  } catch {
    copyState.value = 'err'
    setTimeout(() => {
      copyState.value = 'idle'
    }, 2200)
  }
}

const compareReports = computed(() => {
  const list = props.versions
  const ai = Math.min(Math.max(0, compareA.value), Math.max(0, list.length - 1))
  const bi = Math.min(Math.max(0, compareB.value), Math.max(0, list.length - 1))
  return { a: list[ai], b: list[bi], ai, bi }
})
</script>

<template>
  <!-- 移动端：遮罩 + 底部抽屉 -->
  <Teleport to="body">
    <div
      v-if="mobileOpen"
      class="artifacts-mobile-backdrop"
      aria-hidden="true"
      @click="closeMobile"
    />
  </Teleport>

  <aside
    class="chat-artifacts"
    :class="{
      'chat-artifacts--fullscreen': fullscreen,
      'chat-artifacts--mobile-open': mobileOpen,
    }"
    aria-label="辨证摘要生成物"
  >
    <div class="chat-artifacts__inner">
      <header class="chat-artifacts__bar">
        <h3 class="chat-artifacts__title">
          辨证摘要
        </h3>
        <div class="chat-artifacts__actions">
          <ElButton
            class="chat-artifacts__icon-btn"
            text
            size="small"
            :aria-pressed="compareOpen"
            aria-label="版本对比"
            title="历史版本对比"
            @click="compareOpen = !compareOpen"
          >
            <ElIcon :size="18">
              <Histogram />
            </ElIcon>
          </ElButton>
          <ElButton
            class="chat-artifacts__icon-btn"
            text
            size="small"
            aria-label="复制 JSON"
            title="复制 JSON"
            :disabled="!panelReport"
            @click="copyJson"
          >
            <ElIcon :size="18">
              <DocumentCopy />
            </ElIcon>
          </ElButton>
          <ElButton
            class="chat-artifacts__icon-btn"
            text
            size="small"
            :aria-pressed="fullscreen"
            :aria-label="fullscreen ? '退出全屏' : '全屏'"
            :title="fullscreen ? '退出全屏' : '全屏浏览'"
            @click="fullscreen = !fullscreen"
          >
            <ElIcon :size="18">
              <FullScreen />
            </ElIcon>
          </ElButton>
          <ElButton
            class="chat-artifacts__icon-btn chat-artifacts__icon-btn--mobile"
            text
            size="small"
            aria-label="关闭面板"
            @click="closeMobile"
          >
            <ElIcon :size="18">
              <CloseBold />
            </ElIcon>
          </ElButton>
        </div>
      </header>

      <p
        v-if="copyState === 'ok'"
        class="chat-artifacts__toast chat-artifacts__toast--ok"
        role="status"
      >
        已复制到剪贴板
      </p>
      <p
        v-else-if="copyState === 'err'"
        class="chat-artifacts__toast chat-artifacts__toast--err"
        role="alert"
      >
        复制失败（权限或环境限制）
      </p>

      <div
        v-if="versions.length > 1"
        class="chat-artifacts__picker"
      >
        <label class="chat-artifacts__picker-label">版本</label>
        <select
          v-model.number="selectedIdx"
          class="ds-select chat-artifacts__select"
        >
          <option
            v-for="(v, i) in versions"
            :key="v.id"
            :value="i"
          >
            {{ versionLabel(v, i)
            }}{{ v.report.pattern ? ` · ${v.report.pattern.slice(0, 18)}` : '' }}
          </option>
        </select>
      </div>

      <div
        v-if="loading && streamingReport"
        class="chat-artifacts__badge"
        aria-live="polite"
      >
        流式同步中…
      </div>

      <div
        v-if="!hasAny"
        class="chat-artifacts__empty"
      >
        <p class="chat-artifacts__empty-title">
          暂无生成物
        </p>
        <p class="chat-artifacts__empty-hint">
          模型在思考块中预审配伍后输出 <code class="ds-code">json-report</code>，解析成功后将同步到本面板。
        </p>
      </div>

      <div
        v-else-if="panelReport"
        class="chat-artifacts__card-wrap"
      >
        <DiagnosisReportCard
          :report="panelReport"
          :herb-safety="panelSafety ?? undefined"
          :trace-enabled="traceEnabled"
          @open-trace="traceOpen = true"
        />
      </div>

      <div
        v-if="compareOpen && versions.length >= 2"
        class="chat-artifacts__compare"
      >
        <p class="chat-artifacts__compare-title">
          版本对比
        </p>
        <div class="chat-artifacts__compare-pickers">
          <label class="chat-artifacts__field">
            <span>A</span>
            <select
              v-model.number="compareA"
              class="ds-select chat-artifacts__select"
            >
              <option
                v-for="(v, i) in versions"
                :key="`a-${v.id}`"
                :value="i"
              >
                {{ versionLabel(v, i) }}
              </option>
            </select>
          </label>
          <label class="chat-artifacts__field">
            <span>B</span>
            <select
              v-model.number="compareB"
              class="ds-select chat-artifacts__select"
            >
              <option
                v-for="(v, i) in versions"
                :key="`b-${v.id}`"
                :value="i"
              >
                {{ versionLabel(v, i) }}
              </option>
            </select>
          </label>
        </div>
        <div class="chat-artifacts__compare-grid">
          <div class="chat-artifacts__compare-col">
            <h4 class="chat-artifacts__compare-h">
              A · 证候
            </h4>
            <p class="chat-artifacts__compare-p">
              {{ compareReports.a?.report.pattern ?? '—' }}
            </p>
            <h4 class="chat-artifacts__compare-h">
              方剂
            </h4>
            <p class="chat-artifacts__compare-p">
              {{ compareReports.a?.report.formula || '—' }}
            </p>
          </div>
          <div class="chat-artifacts__compare-col">
            <h4 class="chat-artifacts__compare-h">
              B · 证候
            </h4>
            <p class="chat-artifacts__compare-p">
              {{ compareReports.b?.report.pattern ?? '—' }}
            </p>
            <h4 class="chat-artifacts__compare-h">
              方剂
            </h4>
            <p class="chat-artifacts__compare-p">
              {{ compareReports.b?.report.formula || '—' }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <RetrievalTraceDrawer
      v-model="traceOpen"
      :passages="retrievalPassages ?? []"
      :user-query="traceUserQuery ?? undefined"
    />
  </aside>
</template>

<style scoped>
.chat-artifacts {
  flex: 0 0 min(100%, 22rem);
  width: min(100%, 22rem);
  max-width: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-left: 1px solid var(--color-border);
  background: var(--color-surface);
  z-index: 2;
}

.chat-artifacts--fullscreen {
  position: fixed;
  inset: 0;
  width: 100%;
  max-width: none;
  flex: none;
  z-index: 80;
  border-left: none;
  box-shadow: var(--shadow-dropdown);
}

.chat-artifacts__inner {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
  padding: 0.55rem 0.65rem 0.85rem;
  overflow: auto;
  overscroll-behavior: contain;
}

.chat-artifacts__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.45rem;
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--color-surface);
  padding-bottom: 0.35rem;
  border-bottom: 1px solid var(--color-border-subtle);
}

.chat-artifacts__title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 0.8125rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--color-text);
}

.chat-artifacts__actions {
  display: flex;
  align-items: center;
  gap: 0.1rem;
}

.chat-artifacts__icon-btn {
  min-width: 2rem !important;
  padding: 0.25rem !important;
}

.chat-artifacts__icon-btn--mobile {
  display: none;
}

.chat-artifacts__toast {
  margin: 0 0 0.4rem;
  font-size: 0.75rem;
  padding: 0.28rem 0.45rem;
  border-radius: var(--radius-sm);
}

.chat-artifacts__toast--ok {
  color: var(--color-cta-hover);
  background: rgba(5, 150, 105, 0.08);
}

.chat-artifacts__toast--err {
  color: var(--color-danger);
  background: var(--color-danger-bg);
}

.chat-artifacts__picker {
  margin-bottom: 0.45rem;
}

.chat-artifacts__picker-label {
  display: block;
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-muted);
  margin-bottom: 0.2rem;
}

.chat-artifacts__select {
  width: 100%;
  max-width: 100%;
  font-size: 0.78rem;
  min-height: 2rem;
}

.chat-artifacts__badge {
  display: inline-flex;
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--color-primary-hover);
  background: var(--color-primary-muted);
  padding: 0.18rem 0.4rem;
  border-radius: 999px;
  margin-bottom: 0.45rem;
  width: fit-content;
}

.chat-artifacts__empty {
  padding: 1rem 0.35rem;
  text-align: left;
}

.chat-artifacts__empty-title {
  margin: 0 0 0.35rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.chat-artifacts__empty-hint {
  margin: 0;
  font-size: 0.78rem;
  line-height: 1.5;
  color: var(--color-muted);
}

.chat-artifacts__card-wrap {
  margin-top: 0.15rem;
}

.chat-artifacts__card-wrap :deep(.diagnosis-report__card) {
  box-shadow: none;
}

.chat-artifacts__compare {
  margin-top: 0.85rem;
  padding-top: 0.65rem;
  border-top: 1px dashed var(--color-border-neutral);
}

.chat-artifacts__compare-title {
  margin: 0 0 0.45rem;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--color-text-secondary);
}

.chat-artifacts__compare-pickers {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-bottom: 0.55rem;
}

.chat-artifacts__field {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  font-size: 0.65rem;
  font-weight: 600;
  color: var(--color-muted);
}

.chat-artifacts__compare-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}

.chat-artifacts__compare-col {
  min-width: 0;
  padding: 0.4rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border-subtle);
  background: var(--color-surface-elevated);
}

.chat-artifacts__compare-h {
  margin: 0 0 0.2rem;
  font-size: 0.65rem;
  font-weight: 700;
  color: var(--color-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.chat-artifacts__compare-p {
  margin: 0 0 0.45rem;
  font-size: 0.75rem;
  line-height: 1.45;
  color: var(--color-text);
  word-break: break-word;
}

.chat-artifacts__compare-p:last-child {
  margin-bottom: 0;
}

.artifacts-mobile-backdrop {
  display: none;
}

@media (max-width: 52rem) {
  .chat-artifacts {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    top: auto;
    height: min(62vh, 28rem);
    width: 100%;
    max-width: none;
    flex: none;
    border-left: none;
    border-top: 1px solid var(--color-border);
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    box-shadow: 0 -8px 32px rgba(15, 23, 42, 0.12);
    transform: translateY(110%);
    transition: transform 0.32s cubic-bezier(0.33, 1, 0.68, 1);
    z-index: 70;
  }

  .chat-artifacts--mobile-open {
    transform: translateY(0);
  }

  .chat-artifacts--fullscreen {
    height: 100%;
    max-height: 100dvh;
    border-radius: 0;
    transform: translateY(0);
  }

  .artifacts-mobile-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.35);
    z-index: 65;
  }

  .chat-artifacts__icon-btn--mobile {
    display: inline-flex;
  }

  .chat-artifacts__compare-grid {
    grid-template-columns: 1fr;
  }
}
</style>

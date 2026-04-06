<script setup lang="ts">
import { computed } from 'vue'
import { CircleCheckFilled, Connection, WarningFilled } from '@element-plus/icons-vue'
import {
  ElCard,
  ElDescriptions,
  ElDescriptionsItem,
  ElIcon,
  ElTag,
} from 'element-plus'
import type { HerbSafetyCheckResult, TcmDiagnosisReport } from '@/types/consultation'

const props = defineProps<{
  report: TcmDiagnosisReport
  herbSafety?: HerbSafetyCheckResult | null
  /** 是否有检索摘录可打开溯源抽屉 */
  traceEnabled?: boolean
}>()

const emit = defineEmits<{
  openTrace: []
}>()

function formulaLine(f: string | null): string {
  if (f == null) return '—'
  const t = f.trim()
  return t === '' ? '—' : t
}

const safetyBand = computed(() => {
  const h = props.herbSafety
  if (h == null) {
    return {
      kind: 'unknown' as const,
      title: '临床安全',
      lines: [
        '暂无自动配伍审查数据（常见于历史会话或离线打开）。',
        '用药与组方务必由执业医师或药师审定。',
      ],
    }
  }
  if (h.safe && (!h.warnings || h.warnings.length === 0)) {
    return {
      kind: 'safe' as const,
      title: '安全审计',
      lines: ['未发现明显配伍禁忌（内置「十八反」「十九畏」规则扫描）。'],
    }
  }
  return {
    kind: 'risk' as const,
    title: '配伍禁忌提示',
    lines: h.warnings?.length ? h.warnings : ['模型药材列表中可能存在不宜同用的药对。'],
  }
})
</script>

<template>
  <div class="diagnosis-report">
    <ElCard
      shadow="hover"
      class="diagnosis-report__card"
    >
      <template #header>
        <div class="diagnosis-report__head">
          <span class="diagnosis-report__title">辨证摘要</span>
          <button
            v-if="traceEnabled"
            type="button"
            class="diagnosis-report__trace-btn"
            title="查看 RAG 溯源看板"
            aria-label="查看 RAG 溯源看板"
            @click="emit('openTrace')"
          >
            <ElIcon :size="18">
              <Connection />
            </ElIcon>
          </button>
        </div>
      </template>

      <div
        class="diagnosis-report__safety"
        :class="{
          'diagnosis-report__safety--safe': safetyBand.kind === 'safe',
          'diagnosis-report__safety--risk': safetyBand.kind === 'risk',
          'diagnosis-report__safety--unknown': safetyBand.kind === 'unknown',
        }"
      >
        <div class="diagnosis-report__safety-top">
          <ElIcon
            v-if="safetyBand.kind === 'safe'"
            class="diagnosis-report__safety-ico diagnosis-report__safety-ico--ok"
          >
            <CircleCheckFilled />
          </ElIcon>
          <ElIcon
            v-else-if="safetyBand.kind === 'risk'"
            class="diagnosis-report__safety-ico diagnosis-report__safety-ico--risk"
          >
            <WarningFilled />
          </ElIcon>
          <span class="diagnosis-report__safety-title">{{ safetyBand.title }}</span>
        </div>
        <p
          v-for="(line, i) in safetyBand.lines"
          :key="i"
          class="diagnosis-report__safety-line"
        >
          {{ line }}
        </p>
        <p class="diagnosis-report__safety-disclaimer">
          仅供参考，请遵医嘱；本结果不能替代执业审方与临床判断。
        </p>
      </div>

      <div class="diagnosis-report__pattern-block">
        <span class="diagnosis-report__pattern-label">证候</span>
        <p class="diagnosis-report__pattern">
          {{ report.pattern || '—' }}
        </p>
      </div>

      <ElDescriptions
        :column="1"
        border
        class="diagnosis-report__desc"
      >
        <ElDescriptionsItem label="病机分析">
          {{ report.reasoning || '—' }}
        </ElDescriptionsItem>
        <ElDescriptionsItem label="参考方剂">
          {{ formulaLine(report.formula) }}
        </ElDescriptionsItem>
      </ElDescriptions>

      <div
        v-if="report.herbs.length"
        class="diagnosis-report__section"
      >
        <span class="diagnosis-report__section-label">组成药材</span>
        <div class="diagnosis-report__tags">
          <ElTag
            v-for="(h, i) in report.herbs"
            :key="`${h}-${i}`"
            type="info"
            effect="plain"
            class="diagnosis-report__tag"
          >
            {{ h }}
          </ElTag>
        </div>
      </div>

      <div
        v-if="report.lifestyle.length"
        class="diagnosis-report__section"
      >
        <span class="diagnosis-report__section-label">调理建议</span>
        <ul class="diagnosis-report__list">
          <li
            v-for="(item, i) in report.lifestyle"
            :key="`${item}-${i}`"
          >
            {{ item }}
          </li>
        </ul>
      </div>
    </ElCard>
  </div>
</template>

<style scoped>
.diagnosis-report {
  margin-top: 1rem;
  animation: diagnosis-report-in 0.5s ease-out both;
}

@keyframes diagnosis-report-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.diagnosis-report__card {
  border-radius: 12px;
  max-width: 100%;
  --el-card-padding: 16px 18px;
}

.diagnosis-report__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
}

.diagnosis-report__title {
  font-size: 0.95rem;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.diagnosis-report__trace-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border: none;
  border-radius: 8px;
  background: rgba(99, 102, 241, 0.12);
  color: var(--el-color-primary);
  cursor: pointer;
  flex-shrink: 0;
}

.diagnosis-report__trace-btn:hover {
  background: rgba(99, 102, 241, 0.22);
}

.diagnosis-report__safety {
  margin-bottom: 14px;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid rgba(100, 116, 139, 0.25);
  background: rgba(100, 116, 139, 0.06);
}

.diagnosis-report__safety--safe {
  border-color: rgba(34, 197, 94, 0.45);
  background: rgba(34, 197, 94, 0.08);
}

.diagnosis-report__safety--risk {
  border-color: rgba(239, 68, 68, 0.55);
  background: rgba(239, 68, 68, 0.07);
}

.diagnosis-report__safety--unknown {
  border-color: rgba(100, 116, 139, 0.28);
  background: rgba(148, 163, 184, 0.08);
}

.diagnosis-report__safety-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.diagnosis-report__safety-ico {
  font-size: 1.25rem;
}

.diagnosis-report__safety-ico--ok {
  color: var(--el-color-success);
}

.diagnosis-report__safety-ico--risk {
  color: var(--el-color-danger);
}

.diagnosis-report__safety-title {
  font-size: 0.9rem;
  font-weight: 700;
  letter-spacing: 0.03em;
}

.diagnosis-report__safety-line {
  margin: 0 0 6px;
  font-size: 0.84rem;
  line-height: 1.5;
  color: var(--el-text-color-regular);
}

.diagnosis-report__safety--risk .diagnosis-report__safety-line {
  color: var(--el-text-color-primary);
  font-weight: 500;
}

.diagnosis-report__safety-disclaimer {
  margin: 10px 0 0;
  padding-top: 8px;
  border-top: 1px dashed rgba(100, 116, 139, 0.35);
  font-size: 0.78rem;
  line-height: 1.45;
  color: var(--el-text-color-secondary);
}

.diagnosis-report__pattern-block {
  margin-bottom: 14px;
  padding: 10px 12px;
  border-radius: 8px;
  background: linear-gradient(
    120deg,
    rgba(99, 102, 241, 0.12) 0%,
    rgba(59, 130, 246, 0.08) 100%
  );
  border: 1px solid rgba(99, 102, 241, 0.22);
}

.diagnosis-report__pattern-label {
  display: block;
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--el-color-primary);
  margin-bottom: 6px;
  opacity: 0.9;
}

.diagnosis-report__pattern {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 600;
  line-height: 1.45;
  color: var(--el-color-primary);
}

.diagnosis-report__desc {
  margin-bottom: 0;
}

.diagnosis-report__desc :deep(.el-descriptions__label) {
  width: 88px;
  font-weight: 600;
}

.diagnosis-report__section {
  margin-top: 14px;
}

.diagnosis-report__section-label {
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
}

.diagnosis-report__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.diagnosis-report__tag {
  border-radius: 6px;
}

.diagnosis-report__list {
  margin: 0;
  padding-left: 1.15rem;
  line-height: 1.55;
  color: var(--el-text-color-regular);
}
</style>

<script setup lang="ts">
import { ElCard, ElDescriptions, ElDescriptionsItem, ElTag } from 'element-plus'
import type { TcmDiagnosisReport } from '@/types/consultation'

defineProps<{
  report: TcmDiagnosisReport
}>()

function formulaLine(f: string | null): string {
  if (f == null) return '—'
  const t = f.trim()
  return t === '' ? '—' : t
}
</script>

<template>
  <div class="diagnosis-report">
    <ElCard
      shadow="hover"
      class="diagnosis-report__card"
    >
      <template #header>
        <span class="diagnosis-report__title">辨证摘要</span>
      </template>

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

.diagnosis-report__title {
  font-size: 0.95rem;
  font-weight: 600;
  letter-spacing: 0.02em;
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

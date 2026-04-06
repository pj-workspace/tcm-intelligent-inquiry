<script setup lang="ts">
import { Loading } from '@element-plus/icons-vue'
import type { LiteratureFileView, LiteratureUploadStatus } from '@/types/literature'

defineProps<{
  files: LiteratureFileView[]
  loading: boolean
  collectionId: string | null
}>()

const emit = defineEmits<{
  remove: [fileUuid: string]
}>()

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function onRemove(fileUuid: string) {
  emit('remove', fileUuid)
}

const LIT_STATUS_LABEL: Record<LiteratureUploadStatus, string> = {
  PENDING: '排队',
  READY: '完成',
  FAILED: '失败',
}

function litStatusClass(st: LiteratureUploadStatus) {
  return {
    'lit-ingest-status': true,
    'lit-ingest-status--pending': st === 'PENDING',
    'lit-ingest-status--ready': st === 'READY',
    'lit-ingest-status--failed': st === 'FAILED',
  }
}

function litFailureDetail(f: LiteratureFileView) {
  const m = f.errorMessage?.trim()
  if (m) {
    return m
  }
  return '未返回详细错误信息，可尝试删除后重新上传。'
}
</script>

<template>
  <div>
    <div
      v-if="loading"
      class="lit-skeleton"
      role="status"
      aria-busy="true"
      aria-label="正在加载文献列表"
    >
      <div class="lit-skeleton__row" />
      <div class="lit-skeleton__row lit-skeleton__row--short" />
      <div class="lit-skeleton__row" />
    </div>
    <div
      v-else
      class="lit-table-wrap"
    >
      <table
        class="lit-table"
        aria-label="文献文件"
      >
        <thead>
          <tr>
            <th scope="col">
              文档名
            </th>
            <th scope="col">
              大小
            </th>
            <th scope="col">
              解析状态
            </th>
            <th scope="col">
              上传时间
            </th>
            <th scope="col">
              操作
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="f in files"
            :key="f.fileUuid || String(f.id)"
          >
            <td>{{ f.originalFilename }}</td>
            <td>{{ (f.sizeBytes / 1024).toFixed(1) }} KB</td>
            <td>
              <el-tooltip
                v-if="f.status === 'FAILED'"
                effect="dark"
                placement="top"
                :show-after="200"
                popper-class="ingest-err-tooltip-popper"
              >
                <template #content>
                  <div class="ingest-err-tooltip__body">
                    {{ litFailureDetail(f) }}
                  </div>
                </template>
                <span
                  :class="litStatusClass(f.status)"
                  class="lit-ingest-status-cell lit-ingest-status-cell--hoverable"
                >{{ LIT_STATUS_LABEL[f.status] }}</span>
              </el-tooltip>
              <span
                v-else
                :class="litStatusClass(f.status)"
                class="lit-ingest-status-cell"
              >
                <el-icon
                  v-if="f.status === 'PENDING'"
                  class="is-loading lit-ingest-status-cell__spin"
                >
                  <Loading />
                </el-icon>
                {{ LIT_STATUS_LABEL[f.status] }}
              </span>
            </td>
            <td class="lit-table__mono">
              {{ formatDate(f.createdAt) }}
            </td>
            <td>
              <button
                v-if="f.fileUuid"
                type="button"
                class="ds-link-danger"
                @click="onRemove(f.fileUuid)"
              >
                删除
              </button>
              <span
                v-else
                class="ds-muted"
              >—</span>
            </td>
          </tr>
          <tr v-if="files.length === 0">
            <td
              colspan="5"
              class="lit-table-empty"
            >
              <div
                class="lit-empty"
                role="status"
              >
                <svg
                  class="lit-empty__icon"
                  xmlns="http://www.w3.org/2000/svg"
                  width="40"
                  height="40"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  aria-hidden="true"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
                  />
                </svg>
                <p class="lit-empty__title">
                  {{ collectionId ? '库内暂无文件' : '暂无文件' }}
                </p>
                <p class="lit-empty__hint">
                  {{
                    collectionId
                      ? '可在上方「选择文件」继续添加文献'
                      : '上传首个文件将自动创建临时文献库，也可点击上方「选择文件」开始'
                  }}
                </p>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.lit-skeleton {
  margin-top: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.lit-skeleton__row {
  height: 2.25rem;
  border-radius: 0.5rem;
  background: linear-gradient(
    90deg,
    var(--color-surface-elevated) 0%,
    var(--color-border) 50%,
    var(--color-surface-elevated) 100%
  );
  background-size: 200% 100%;
  animation: lit-table-shimmer 1.2s ease-in-out infinite;
}
.lit-skeleton__row--short {
  width: 70%;
}
@keyframes lit-table-shimmer {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: -100% 0;
  }
}
.lit-table-wrap {
  margin-top: 0.75rem;
  overflow-x: auto;
}
.lit-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}
.lit-table th,
.lit-table td {
  text-align: left;
  padding: 0.5rem 0.65rem;
  border-bottom: 1px solid var(--color-border);
}
.lit-table th {
  font-weight: 600;
  color: var(--color-text-secondary);
  font-size: 0.75rem;
}
.lit-table__mono {
  font-variant-numeric: tabular-nums;
  font-size: 0.8125rem;
  color: var(--color-muted);
}
.lit-table-empty {
  padding: 0;
  border-bottom: none;
  vertical-align: middle;
}
.lit-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 2rem 1.25rem 2.25rem;
  color: var(--color-muted);
}
.lit-empty__icon {
  color: var(--color-border-strong);
  margin-bottom: 0.65rem;
}
.lit-empty__title {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--color-text-secondary);
}
.lit-empty__hint {
  margin: 0.35rem 0 0;
  font-size: 0.8125rem;
  line-height: 1.45;
  max-width: 24rem;
}
.lit-ingest-status-cell {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  vertical-align: middle;
}
.lit-ingest-status-cell--hoverable {
  cursor: help;
  text-decoration: underline;
  text-decoration-style: dotted;
  text-underline-offset: 0.12em;
}
.lit-ingest-status-cell__spin {
  font-size: 0.95rem;
}
.lit-ingest-status {
  display: inline-block;
  padding: 0.15rem 0.45rem;
  border-radius: 0.35rem;
  font-size: 0.75rem;
  font-weight: 500;
}
.lit-ingest-status--pending {
  background: var(--color-surface-elevated);
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
}
.lit-ingest-status--ready {
  background: color-mix(in srgb, var(--color-success, #16a34a) 14%, transparent);
  color: var(--color-success, #15803d);
}
.lit-ingest-status--failed {
  background: color-mix(in srgb, var(--color-danger) 14%, transparent);
  color: var(--color-danger);
}
</style>

<style>
.ingest-err-tooltip-popper .ingest-err-tooltip__body {
  max-width: min(26rem, 85vw);
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.45;
  font-size: 0.8125rem;
}
</style>

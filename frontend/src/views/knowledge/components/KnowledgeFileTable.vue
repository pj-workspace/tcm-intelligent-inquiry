<script setup lang="ts">
import type { KnowledgeFileView } from '@/types/knowledge'

defineProps<{
  files: KnowledgeFileView[]
  loading: boolean
  /** 未选知识库时空态文案区分 */
  knowledgeBaseSelected: boolean
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
</script>

<template>
  <div>
    <div
      v-if="loading"
      class="kb-skeleton"
      role="status"
      aria-busy="true"
      aria-label="正在加载文档列表"
    >
      <div class="kb-skeleton__row" />
      <div class="kb-skeleton__row kb-skeleton__row--short" />
      <div class="kb-skeleton__row" />
    </div>
    <div
      v-else
      class="kb-table-wrap"
    >
      <table
        class="kb-table"
        aria-label="知识库文档"
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
              类型
            </th>
            <th scope="col">
              向量块数
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
            :key="f.fileUuid"
          >
            <td>{{ f.originalFilename }}</td>
            <td>{{ (f.sizeBytes / 1024).toFixed(1) }} KB</td>
            <td>{{ f.contentType ?? '—' }}</td>
            <td class="kb-table__mono">
              {{
                f.embedChunkCount != null ? f.embedChunkCount : '—'
              }}
            </td>
            <td class="kb-table__mono">
              {{ formatDate(f.createdAt) }}
            </td>
            <td>
              <button
                type="button"
                class="ds-link-danger"
                @click="emit('remove', f.fileUuid)"
              >
                删除
              </button>
            </td>
          </tr>
          <tr v-if="files.length === 0">
            <td
              colspan="6"
              class="kb-table-empty"
            >
              <div
                class="kb-empty"
                role="status"
              >
                <svg
                  class="kb-empty__icon"
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
                    d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                  />
                </svg>
                <p class="kb-empty__title">
                  {{ knowledgeBaseSelected ? '暂无文件' : '未选择知识库' }}
                </p>
                <p class="kb-empty__hint">
                  {{
                    knowledgeBaseSelected
                      ? '点击上方「选择文件上传」添加文档到当前知识库'
                      : '请先在上方选择或创建一个知识库'
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
.kb-skeleton {
  margin-top: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.kb-skeleton__row {
  height: 2.25rem;
  border-radius: 0.5rem;
  background: linear-gradient(
    90deg,
    var(--color-surface-elevated) 0%,
    var(--color-border) 50%,
    var(--color-surface-elevated) 100%
  );
  background-size: 200% 100%;
  animation: kb-file-table-shimmer 1.2s ease-in-out infinite;
}
.kb-skeleton__row--short {
  width: 70%;
}
@keyframes kb-file-table-shimmer {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: -100% 0;
  }
}
.kb-table-wrap {
  margin-top: 0.75rem;
  overflow-x: auto;
}
.kb-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}
.kb-table th,
.kb-table td {
  text-align: left;
  padding: 0.5rem 0.65rem;
  border-bottom: 1px solid var(--color-border);
}
.kb-table th {
  font-weight: 600;
  color: var(--color-text-secondary);
  font-size: 0.75rem;
}
.kb-table__mono {
  font-variant-numeric: tabular-nums;
  font-size: 0.8125rem;
  color: var(--color-muted);
}
.kb-table-empty {
  padding: 0;
  border-bottom: none;
  vertical-align: middle;
}
.kb-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 2rem 1.25rem 2.25rem;
  color: var(--color-muted);
}
.kb-empty__icon {
  color: var(--color-border-strong);
  margin-bottom: 0.65rem;
}
.kb-empty__title {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--color-text-secondary);
}
.kb-empty__hint {
  margin: 0.35rem 0 0;
  font-size: 0.8125rem;
  line-height: 1.45;
  max-width: 22rem;
}
</style>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { getErrorMessage } from '@/api/core/errors'
import {
  deleteLiteratureCollection,
  deleteLiteratureDocument,
  getLiteratureHealth,
  listLiteratureCollectionFiles,
  uploadLiteratureFile,
} from '@/api/modules/literature'
import type { LiteratureFileView } from '@/types/literature'
import {
  formatHealthStatus,
  isHealthStatusErr,
  isHealthStatusOk,
} from '@/utils/formatHealthStatus'

const health = ref('加载中…')
const collectionId = ref<string | null>(null)
const files = ref<LiteratureFileView[]>([])
const loadingFiles = ref(false)
const uploading = ref(false)
const msg = ref('')
const chunkSize = ref(512)

async function refreshHealth() {
  try {
    const { data } = await getLiteratureHealth()
    health.value = formatHealthStatus(data.code, data.message ?? '')
  } catch (e) {
    health.value = getErrorMessage(e)
  }
}

async function loadFiles() {
  if (!collectionId.value) {
    files.value = []
    return
  }
  loadingFiles.value = true
  try {
    const { data } = await listLiteratureCollectionFiles(collectionId.value)
    if (data.code !== 0) throw new Error(data.message)
    files.value = data.data ?? []
  } finally {
    loadingFiles.value = false
  }
}

watch(collectionId, () => {
  void loadFiles()
})

async function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  input.value = ''
  if (!f) return
  uploading.value = true
  msg.value = ''
  try {
    const fd = new FormData()
    fd.append('file', f)
    if (collectionId.value) {
      fd.append('collectionId', collectionId.value)
    }
    if (chunkSize.value > 32) {
      fd.append('chunkSize', String(chunkSize.value))
    }
    const { data } = await uploadLiteratureFile(fd)
    if (data.code !== 0) throw new Error(data.message)
    const row = data.data
    if (row) {
      collectionId.value = row.tempCollectionId
      msg.value = `已解析入库：${row.originalFilename}`
    }
    await loadFiles()
  } catch (e) {
    msg.value = getErrorMessage(e)
  } finally {
    uploading.value = false
  }
}

async function removeFile(fileUuid: string) {
  if (!collectionId.value) return
  if (!confirm('确定从当前文献库删除此文件及其向量？')) return
  await deleteLiteratureDocument(collectionId.value, fileUuid)
  await loadFiles()
}

async function purgeCollection() {
  if (!collectionId.value) return
  if (!confirm('确定删除当前临时文献库及其向量？')) return
  await deleteLiteratureCollection(collectionId.value)
  collectionId.value = null
  files.value = []
  msg.value = '已清空临时库'
}

async function newCollection() {
  collectionId.value = null
  files.value = []
  msg.value = '请上传首个文件，将自动新建临时文献库'
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

onMounted(async () => {
  await refreshHealth()
})
</script>

<template>
  <div
    class="ds-page lit-page"
  >
    <h2 class="ds-h2">
      文献库管理
    </h2>
    <p class="ds-lead lit-lead">
      上传与解析文献向量；基于文献的问答请在「智能问诊」中选择「文献库」并指定本页显示的临时库 ID。
    </p>
    <p
      class="ds-status lit-health"
      :class="
        isHealthStatusErr(health)
          ? 'ds-status--err'
          : isHealthStatusOk(health)
            ? 'ds-status--ok'
            : ''
      "
    >
      {{ health }}
    </p>

    <section class="ds-card">
      <h3 class="ds-h3 ds-card__title">
        临时文献库
      </h3>
      <p
        v-if="collectionId"
        class="lit-meta lit-meta--technical"
      >
        <span class="lit-meta__label">临时库 ID</span>
        <code class="ds-code lit-meta__code">{{ collectionId }}</code>
        <button
          type="button"
          class="ds-btn ds-btn--ghost"
          @click="newCollection"
        >
          新建空库（仅前端切换）
        </button>
        <button
          type="button"
          class="ds-btn ds-btn--danger"
          @click="purgeCollection"
        >
          删除服务端整库
        </button>
      </p>
      <p
        v-else
        class="ds-muted"
      >
        尚未上传：首次上传会自动分配临时库 ID。
      </p>
    </section>

    <section class="ds-card">
      <h3 class="ds-h3 ds-card__title">
        上传文献
      </h3>
      <div class="ds-row ds-row--center lit-upload-row">
        <label class="ds-field lit-field-inline">
          分块约长（chunkSize）
          <input
            v-model.number="chunkSize"
            class="ds-input ds-input--narrow"
            type="number"
            inputmode="numeric"
            min="128"
            max="2048"
            step="64"
          >
        </label>
        <label class="ds-file-label ds-file-label--solid lit-file-btn">
          选择文件
          <input
            type="file"
            :disabled="uploading"
            @change="onFileChange"
          >
        </label>
      </div>
      <p
        v-if="msg"
        class="ds-msg--success"
      >
        {{ msg }}
      </p>
      <p
        v-if="loadingFiles"
        class="ds-muted"
      >
        加载列表…
      </p>
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
                <span class="ds-badge">{{ f.status }}</span>
              </td>
              <td class="lit-table__mono">
                {{ formatDate(f.createdAt) }}
              </td>
              <td>
                <button
                  v-if="f.fileUuid"
                  type="button"
                  class="ds-link-danger"
                  @click="removeFile(f.fileUuid)"
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
    </section>
  </div>
</template>

<style scoped>
.lit-page {
  max-width: 56rem;
}
.lit-lead {
  margin-top: -0.25rem;
  margin-bottom: 0.75rem;
  max-width: 42rem;
}
.lit-health {
  margin-bottom: 0.75rem;
}
.lit-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  align-items: center;
  margin: 0;
  color: var(--color-text-secondary);
}
.lit-meta--technical {
  font-size: 0.8125rem;
}
.lit-meta__label {
  color: var(--color-muted);
  font-size: 0.75rem;
}
.lit-meta__code {
  font-size: 0.6875rem;
}
.lit-upload-row {
  margin-top: 0.5rem;
  gap: 1rem;
}
.lit-field-inline {
  flex-direction: row;
  align-items: center;
  gap: 0.65rem;
}
.lit-field-inline .ds-input--narrow {
  width: 6.5rem;
  min-width: 6.5rem;
}
.lit-file-btn {
  flex-shrink: 0;
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
</style>

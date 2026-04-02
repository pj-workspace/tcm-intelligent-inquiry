<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { getErrorMessage } from '@/api/core/errors'
import DsSelect from '@/components/common/DsSelect.vue'
import type { DsSelectOption } from '@/components/common/DsSelect.vue'
import {
  createKnowledgeBase,
  deleteKnowledgeDocument,
  getKnowledgeHealth,
  listKnowledgeBases,
  listKnowledgeDocuments,
  uploadKnowledgeDocument,
} from '@/api/modules/knowledge'
import type { KnowledgeBase, KnowledgeFileView } from '@/types/knowledge'
import {
  formatHealthStatus,
  isHealthStatusErr,
  isHealthStatusOk,
} from '@/utils/formatHealthStatus'

const health = ref('加载中…')
const bases = ref<KnowledgeBase[]>([])
const selectedBaseId = ref<number | null>(null)
const files = ref<KnowledgeFileView[]>([])
const loadingFiles = ref(false)
const uploading = ref(false)
const ingestMsg = ref('')
const newBaseName = ref('默认知识库')
const newBaseEmbed = ref('bge-m3:latest')
const chunkSize = ref(512)

const baseSelectOptions = computed<DsSelectOption[]>(() => {
  if (bases.value.length === 0) {
    return [{ value: null, label: '请先创建知识库', disabled: true }]
  }
  return bases.value.map((b) => ({
    value: b.id,
    label: `${b.name} (id=${b.id})`,
  }))
})

async function refreshHealth() {
  try {
    const { data } = await getKnowledgeHealth()
    health.value = formatHealthStatus(data.code, data.message ?? '')
  } catch (e) {
    health.value = getErrorMessage(e)
  }
}

async function loadBases() {
  const { data } = await listKnowledgeBases()
  if (data.code !== 0) throw new Error(data.message)
  bases.value = data.data ?? []
  if (selectedBaseId.value == null && bases.value.length > 0) {
    selectedBaseId.value = bases.value[0].id
  }
}

async function createBase() {
  ingestMsg.value = ''
  const { data } = await createKnowledgeBase({
    name: newBaseName.value.trim() || '未命名知识库',
    embeddingModel: newBaseEmbed.value.trim() || 'bge-m3:latest',
  })
  if (data.code !== 0) throw new Error(data.message)
  await loadBases()
  if (data.data) selectedBaseId.value = data.data.id
  ingestMsg.value = '知识库已创建'
}

async function loadFiles() {
  if (selectedBaseId.value == null) {
    files.value = []
    return
  }
  loadingFiles.value = true
  try {
    const { data } = await listKnowledgeDocuments(selectedBaseId.value)
    if (data.code !== 0) throw new Error(data.message)
    files.value = data.data ?? []
  } finally {
    loadingFiles.value = false
  }
}

async function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  input.value = ''
  if (!f || selectedBaseId.value == null) return
  uploading.value = true
  ingestMsg.value = ''
  try {
    const fd = new FormData()
    fd.append('file', f)
    if (chunkSize.value > 32) {
      fd.append('chunkSize', String(chunkSize.value))
    }
    const { data } = await uploadKnowledgeDocument(selectedBaseId.value, fd)
    if (data.code !== 0) throw new Error(data.message)
    ingestMsg.value = `已入库：${data.data?.originalFilename ?? ''}`
    await loadFiles()
  } catch (e) {
    ingestMsg.value = getErrorMessage(e)
  } finally {
    uploading.value = false
  }
}

async function removeFile(fileUuid: string) {
  if (selectedBaseId.value == null) return
  if (!confirm('确定从该知识库删除此文档及其向量？')) return
  await deleteKnowledgeDocument(selectedBaseId.value, fileUuid)
  await loadFiles()
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

watch(selectedBaseId, () => {
  void loadFiles()
})

onMounted(async () => {
  await refreshHealth()
  try {
    await loadBases()
  } catch (e) {
    ingestMsg.value = getErrorMessage(e)
  }
})
</script>

<template>
  <div
    class="ds-page kb-page"
  >
    <h2 class="ds-h2">
      知识库管理
    </h2>
    <p class="ds-lead kb-lead">
      在此维护向量知识库与文档；问答与 RAG 请使用主导航「智能问诊」统一入口，并选择「知识库 RAG」模式。
    </p>
    <p
      class="ds-status kb-health"
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
        知识库
      </h3>
      <div class="kb-card-stack">
        <label class="ds-field kb-field-current">
          当前库
          <DsSelect
            v-model="selectedBaseId"
            class="kb-base-select"
            :options="baseSelectOptions"
            placeholder="请选择知识库"
            aria-label="当前知识库"
          />
        </label>
        <div class="kb-create-fields">
          <input
            v-model="newBaseName"
            class="ds-input kb-input"
            placeholder="新库名称"
          >
          <input
            v-model="newBaseEmbed"
            class="ds-input kb-input"
            placeholder="Embedding 模型"
          >
        </div>
        <div class="kb-create-actions">
          <button
            type="button"
            class="ds-btn ds-btn--primary"
            @click="createBase"
          >
            创建知识库
          </button>
        </div>
      </div>
    </section>

    <section class="ds-card">
      <h3 class="ds-h3 ds-card__title">
        上传与文档列表
      </h3>
      <p class="ds-hint">
        使用 Apache Tika 解析 PDF/Word/TXT 等；分块约长可调整。删除会移除向量切片，需重新上传才能再次检索。
      </p>
      <div class="ds-row ds-row--center kb-upload-row">
        <label class="ds-field kb-field-inline">
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
        <label class="ds-file-label ds-file-label--solid kb-file-btn">
          选择文件上传
          <input
            type="file"
            :disabled="uploading || selectedBaseId == null"
            @change="onFileChange"
          >
        </label>
      </div>
      <p
        v-if="ingestMsg"
        class="ds-msg--success"
      >
        {{ ingestMsg }}
      </p>
      <p
        v-if="loadingFiles"
        class="ds-muted"
      >
        加载文件列表…
      </p>
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
                {{ formatDate(f.createdAt) }}
              </td>
              <td>
                <button
                  type="button"
                  class="ds-link-danger"
                  @click="removeFile(f.fileUuid)"
                >
                  删除
                </button>
              </td>
            </tr>
            <tr v-if="files.length === 0">
              <td
                colspan="5"
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
                    暂无文件
                  </p>
                  <p class="kb-empty__hint">
                    点击上方「选择文件上传」添加文档到当前知识库
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
.kb-page {
  max-width: 56rem;
}
.kb-lead {
  margin-top: -0.25rem;
  margin-bottom: 0.75rem;
  max-width: 40rem;
}
.kb-health {
  margin-bottom: 1.25rem;
}
.kb-card-stack {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-top: 0;
}
.kb-field-current {
  max-width: min(100%, 28rem);
}
.kb-base-select {
  margin-top: 0.35rem;
  width: 100%;
  max-width: min(100%, 28rem);
}
.kb-create-fields {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
}
.kb-create-actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.kb-input {
  flex: 1;
  min-width: 9rem;
  max-width: min(100%, 20rem);
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
.kb-upload-row {
  margin-top: 0.5rem;
  gap: 1rem;
}
.kb-field-inline {
  flex-direction: row;
  align-items: center;
  gap: 0.65rem;
}
.kb-field-inline .ds-input {
  width: 6.5rem;
  min-width: 6.5rem;
}
.kb-file-btn {
  flex-shrink: 0;
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
</style>

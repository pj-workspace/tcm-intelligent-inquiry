<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { apiClient } from '@/api/client'
import type { ApiResult } from '@/types/api'
import type { KnowledgeBase, KnowledgeFileView, KnowledgeQueryResponse } from '@/types/knowledge'

const health = ref('加载中…')
const bases = ref<KnowledgeBase[]>([])
const selectedBaseId = ref<number | null>(null)
const files = ref<KnowledgeFileView[]>([])
const loadingFiles = ref(false)
const uploading = ref(false)
const ingestMsg = ref('')
const newBaseName = ref('默认知识库')
const newBaseEmbed = ref('bge-m3:latest')
const queryText = ref('百合薏米粥适合什么体质简要说明？')
const topK = ref(4)
const ragAnswer = ref('')
const ragSources = ref<string[]>([])
const ragLoading = ref(false)
const ragError = ref<string | null>(null)
const chunkSize = ref(512)

async function refreshHealth() {
  try {
    const { data } = await apiClient.get<ApiResult<string>>('/v1/knowledge/health')
    health.value = `code=${data.code} ${data.message}`
  } catch (e) {
    health.value = e instanceof Error ? e.message : '请求失败'
  }
}

async function loadBases() {
  const { data } = await apiClient.get<ApiResult<KnowledgeBase[]>>('/v1/knowledge/bases')
  if (data.code !== 0) throw new Error(data.message)
  bases.value = data.data ?? []
  if (selectedBaseId.value == null && bases.value.length > 0) {
    selectedBaseId.value = bases.value[0].id
  }
}

async function createBase() {
  ingestMsg.value = ''
  const { data } = await apiClient.post<ApiResult<KnowledgeBase>>('/v1/knowledge/bases', {
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
    const { data } = await apiClient.get<ApiResult<KnowledgeFileView[]>>(
      `/v1/knowledge/bases/${selectedBaseId.value}/documents`
    )
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
    const { data } = await apiClient.post<ApiResult<KnowledgeFileView>>(
      `/v1/knowledge/bases/${selectedBaseId.value}/documents`,
      fd
    )
    if (data.code !== 0) throw new Error(data.message)
    ingestMsg.value = `已入库：${data.data?.originalFilename ?? ''}`
    await loadFiles()
  } catch (e) {
    ingestMsg.value = e instanceof Error ? e.message : '上传失败'
  } finally {
    uploading.value = false
  }
}

async function removeFile(fileUuid: string) {
  if (selectedBaseId.value == null) return
  await apiClient.delete<ApiResult<unknown>>(
    `/v1/knowledge/bases/${selectedBaseId.value}/documents/${fileUuid}`
  )
  await loadFiles()
}

async function runQuery() {
  if (selectedBaseId.value == null || !queryText.value.trim()) return
  ragLoading.value = true
  ragError.value = null
  ragAnswer.value = ''
  ragSources.value = []
  try {
    const { data } = await apiClient.post<ApiResult<KnowledgeQueryResponse>>(
      `/v1/knowledge/bases/${selectedBaseId.value}/query`,
      {
        message: queryText.value.trim(),
        topK: topK.value,
        similarityThreshold: 0,
      }
    )
    if (data.code !== 0) throw new Error(data.message)
    const r = data.data
    if (r) {
      ragAnswer.value = r.answer
      ragSources.value = r.sources ?? []
    }
  } catch (e) {
    ragError.value = e instanceof Error ? e.message : String(e)
  } finally {
    ragLoading.value = false
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
    ingestMsg.value = e instanceof Error ? e.message : '加载失败'
  }
})
</script>

<template>
  <div class="page">
    <h2>中医药知识库（RAG）</h2>
    <p class="health">{{ health }}</p>

    <section class="card">
      <h3>知识库</h3>
      <div class="row">
        <label>
          当前库
          <select v-model.number="selectedBaseId">
            <option v-for="b in bases" :key="b.id" :value="b.id">
              {{ b.name }} (id={{ b.id }})
            </option>
          </select>
        </label>
        <div class="create-inline">
          <input v-model="newBaseName" placeholder="新库名称" />
          <input v-model="newBaseEmbed" placeholder="Embedding 模型" />
          <button type="button" class="btn" @click="createBase">创建</button>
        </div>
      </div>
    </section>

    <section class="card">
      <h3>上传与文档</h3>
      <p class="hint">使用 Apache Tika 解析 PDF/Word/TXT 等；分块大小（token 约估）可调整。</p>
      <div class="row">
        <label>
          分块约长（chunkSize）
          <input v-model.number="chunkSize" type="number" min="128" max="2048" step="64" />
        </label>
        <label class="file-wrap">
          <input
            type="file"
            :disabled="uploading || selectedBaseId == null"
            @change="onFileChange"
          />
        </label>
      </div>
      <p v-if="ingestMsg" class="msg">{{ ingestMsg }}</p>
      <p v-if="loadingFiles">加载文件列表…</p>
      <ul v-else class="file-list">
        <li v-for="f in files" :key="f.fileUuid">
          <span>{{ f.originalFilename }}</span>
          <span class="muted">{{ (f.sizeBytes / 1024).toFixed(1) }} KB</span>
          <button type="button" class="link" @click="removeFile(f.fileUuid)">删除</button>
        </li>
        <li v-if="files.length === 0" class="muted">暂无文件</li>
      </ul>
    </section>

    <section class="card">
      <h3>知识问答</h3>
      <textarea v-model="queryText" rows="3" class="ta" placeholder="输入问题…" />
      <div class="row">
        <label>
          Top-K
          <input v-model.number="topK" type="number" min="1" max="20" />
        </label>
        <button type="button" class="btn primary" :disabled="ragLoading" @click="runQuery">
          {{ ragLoading ? '生成中…' : '检索并生成' }}
        </button>
      </div>
      <p v-if="ragError" class="err">{{ ragError }}</p>
      <div v-if="ragAnswer" class="answer">
        <h4>回答</h4>
        <p class="body">{{ ragAnswer }}</p>
        <p v-if="ragSources.length" class="sources">
          <strong>来源文件：</strong>{{ ragSources.join('、') }}
        </p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.page {
  max-width: 720px;
}
h2 {
  margin-top: 0;
}
h3 {
  margin: 0 0 0.5rem;
  font-size: 1rem;
}
.health {
  font-size: 0.85rem;
  color: #4b5563;
  margin-bottom: 1rem;
}
.card {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 1rem;
  margin-bottom: 1rem;
  background: #fff;
}
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: center;
  margin-top: 0.5rem;
}
.create-inline {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}
.create-inline input {
  padding: 0.35rem 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  width: 10rem;
}
.hint {
  font-size: 0.8rem;
  color: #6b7280;
  margin: 0 0 0.5rem;
}
.msg {
  font-size: 0.9rem;
  color: #047857;
}
.file-list {
  list-style: none;
  padding: 0;
  margin: 0.5rem 0 0;
}
.file-list li {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  padding: 0.35rem 0;
  border-bottom: 1px solid #f3f4f6;
}
.muted {
  color: #9ca3af;
  font-size: 0.85rem;
}
.link {
  margin-left: auto;
  background: none;
  border: none;
  color: #dc2626;
  cursor: pointer;
  font-size: 0.85rem;
}
.ta {
  width: 100%;
  border-radius: 10px;
  border: 1px solid #d1d5db;
  padding: 0.6rem 0.75rem;
  font-family: inherit;
  margin-bottom: 0.5rem;
}
.btn {
  padding: 0.45rem 0.9rem;
  border-radius: 8px;
  border: 1px solid #d1d5db;
  background: #fff;
  cursor: pointer;
}
.btn.primary {
  background: #059669;
  border-color: #047857;
  color: #fff;
}
.err {
  color: #b91c1c;
  font-size: 0.9rem;
}
.answer .body {
  white-space: pre-wrap;
  line-height: 1.5;
  margin: 0.5rem 0;
}
.sources {
  font-size: 0.85rem;
  color: #4b5563;
}
</style>

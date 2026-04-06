<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { silentAxiosConfig } from '@/api/core/client'
import { getErrorMessage } from '@/api/core/errors'
import {
  deleteKnowledgeDocument,
  getKnowledgeHealth,
  listKnowledgeBases,
  listKnowledgeDocuments,
} from '@/api/modules/knowledge'
import KnowledgeBaseSelector from '@/views/knowledge/components/KnowledgeBaseSelector.vue'
import KnowledgeFileTable from '@/views/knowledge/components/KnowledgeFileTable.vue'
import KnowledgeProbeChat from '@/views/knowledge/components/KnowledgeProbeChat.vue'
import KnowledgeUploadManager from '@/views/knowledge/components/KnowledgeUploadManager.vue'
import { useSmartIngestListPolling } from '@/composables/useSmartIngestListPolling'
import type { KnowledgeBase, KnowledgeFileView } from '@/types/knowledge'
import { knowledgeFilesNeedPoll } from '@/types/knowledge'
import {
  formatHealthStatus,
  isHealthStatusErr,
  isHealthStatusOk,
} from '@/utils/formatHealthStatus'

const health = ref('加载中…')
const kbList = ref<KnowledgeBase[]>([])
const currentKbId = ref<number | null>(null)
const files = ref<KnowledgeFileView[]>([])
const loadingFiles = ref(false)
const loadFilesBusy = ref(false)
const bootstrapMsg = ref('')
const listPolling = useSmartIngestListPolling({ intervalMs: 4000 })

function scheduleListPollingReconcile() {
  const tick = () => {
    void loadFiles()
  }
  listPolling.reconcile(knowledgeFilesNeedPoll(files.value), tick)
}

async function loadKnowledgeBases() {
  const { data } = await listKnowledgeBases(silentAxiosConfig)
  if (data.code !== 0) throw new Error(data.message)
  kbList.value = data.data ?? []
  if (currentKbId.value == null && kbList.value.length > 0) {
    currentKbId.value = kbList.value[0].id
  }
}

async function loadFiles() {
  if (loadFilesBusy.value) {
    return
  }
  loadFilesBusy.value = true
  if (currentKbId.value == null) {
    files.value = []
    listPolling.stop()
    loadFilesBusy.value = false
    return
  }
  loadingFiles.value = true
  try {
    const { data } = await listKnowledgeDocuments(
      currentKbId.value,
      silentAxiosConfig
    )
    if (data.code !== 0) throw new Error(data.message)
    files.value = data.data ?? []
  } finally {
    loadingFiles.value = false
    loadFilesBusy.value = false
    scheduleListPollingReconcile()
  }
}

async function refreshHealth() {
  try {
    const { data } = await getKnowledgeHealth(silentAxiosConfig)
    health.value = formatHealthStatus(data.code, data.message ?? '')
  } catch (e) {
    health.value = getErrorMessage(e)
  }
}

async function reloadBasesSafe() {
  try {
    await loadKnowledgeBases()
  } catch (e) {
    ElMessage.error(getErrorMessage(e))
  }
}

watch(currentKbId, () => {
  listPolling.stop()
  void loadFiles()
})

async function removeFile(fileUuid: string) {
  if (currentKbId.value == null) return
  if (!confirm('确定从该知识库删除此文档及其向量？')) return
  await deleteKnowledgeDocument(
    currentKbId.value,
    fileUuid,
    silentAxiosConfig
  )
  await loadFiles()
}

onMounted(async () => {
  await refreshHealth()
  try {
    await loadKnowledgeBases()
  } catch (e) {
    bootstrapMsg.value = getErrorMessage(e)
  }
})

onUnmounted(() => {
  listPolling.stop()
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
      在此维护向量知识库与文档；「检索试答」可对当前库做 SSE 流式验库。多轮问诊、导出与高级参数仍请使用「智能问诊」中的「知识库 RAG」模式。
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
    <p
      v-if="bootstrapMsg"
      class="kb-bootstrap-msg"
      role="alert"
    >
      {{ bootstrapMsg }}
    </p>

    <KnowledgeBaseSelector
      v-model:selected-id="currentKbId"
      :bases="kbList"
      @reload-bases="reloadBasesSafe"
    />

    <section class="ds-card kb-ingest-card">
      <KnowledgeUploadManager
        :knowledge-base-id="currentKbId"
        :load-files="loadFiles"
      />
      <KnowledgeFileTable
        :files="files"
        :loading="loadingFiles"
        :knowledge-base-selected="currentKbId != null"
        @remove="removeFile"
      />
    </section>

    <KnowledgeProbeChat :knowledge-base-id="currentKbId" />
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
.kb-bootstrap-msg {
  margin: -0.75rem 0 1rem;
  font-size: 0.875rem;
  color: var(--color-danger);
}
.kb-ingest-card {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
</style>

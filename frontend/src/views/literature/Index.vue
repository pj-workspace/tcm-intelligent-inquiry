<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { onBeforeRouteLeave } from 'vue-router'
import { silentAxiosConfig } from '@/api/core/client'
import { getErrorMessage } from '@/api/core/errors'
import {
  deleteLiteratureCollection,
  deleteLiteratureDocument,
  getLiteratureHealth,
  listLiteratureCollectionFiles,
} from '@/api/modules/literature'
import LiteratureFileTable from '@/views/literature/components/LiteratureFileTable.vue'
import LiteratureProbeChat from '@/views/literature/components/LiteratureProbeChat.vue'
import LiteratureUploadManager from '@/views/literature/components/LiteratureUploadManager.vue'
import { useSmartIngestListPolling } from '@/composables/useSmartIngestListPolling'
import type { LiteratureFileView } from '@/types/literature'
import { literatureFilesNeedPoll } from '@/types/literature'
import {
  formatHealthStatus,
  isHealthStatusErr,
  isHealthStatusOk,
} from '@/utils/formatHealthStatus'
import {
  LITERATURE_TAB_COLLECTION_SESSION_KEY,
  setLiteratureTabCollectionId,
} from '@/utils/literatureBeacon'

const health = ref('加载中…')
const collectionId = ref<string | null>(null)
const files = ref<LiteratureFileView[]>([])
const loadingFiles = ref(false)
const loadFilesBusy = ref(false)
const listPolling = useSmartIngestListPolling({ intervalMs: 4000 })

const literatureUploadRef = ref<InstanceType<typeof LiteratureUploadManager> | null>(
  null
)

function scheduleListPollingReconcile() {
  listPolling.reconcile(literatureFilesNeedPoll(files.value), () => {
    void loadFiles()
  })
}

async function loadFiles() {
  if (loadFilesBusy.value) {
    return
  }
  loadFilesBusy.value = true
  if (!collectionId.value) {
    files.value = []
    listPolling.stop()
    loadFilesBusy.value = false
    return
  }
  loadingFiles.value = true
  try {
    const { data } = await listLiteratureCollectionFiles(
      collectionId.value,
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
    const { data } = await getLiteratureHealth(silentAxiosConfig)
    health.value = formatHealthStatus(data.code, data.message ?? '')
  } catch (e) {
    health.value = getErrorMessage(e)
  }
}

watch(collectionId, () => {
  listPolling.stop()
  void loadFiles()
})

watch(collectionId, (v, oldV) => {
  if (v) {
    setLiteratureTabCollectionId(v)
  } else if (oldV != null) {
    setLiteratureTabCollectionId(null)
  }
})

async function removeFile(fileUuid: string) {
  if (!collectionId.value) return
  if (!confirm('确定从当前文献库删除此文件及其向量？')) return
  await deleteLiteratureDocument(
    collectionId.value,
    fileUuid,
    silentAxiosConfig
  )
  await loadFiles()
}

async function purgeCollection() {
  if (!collectionId.value) return
  if (!confirm('确定删除当前临时文献库及其向量？')) return
  await deleteLiteratureCollection(collectionId.value, silentAxiosConfig)
  collectionId.value = null
  files.value = []
  literatureUploadRef.value?.setUploadMessage('已清空临时库')
}

async function newCollection() {
  collectionId.value = null
  files.value = []
  literatureUploadRef.value?.setUploadMessage(
    '请上传首个文件，将自动新建临时文献库'
  )
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

const collectionExpiresLabel = computed(() => {
  const row = files.value.find((f) => f.expiresAt)
  if (!row?.expiresAt) return ''
  return `当前临时库向量与文件计划在 ${formatDate(row.expiresAt)} 自动清理（任一新上传会将整库有效期顺延）。`
})

onMounted(async () => {
  if (!collectionId.value) {
    try {
      const raw = sessionStorage.getItem(LITERATURE_TAB_COLLECTION_SESSION_KEY)
      const trimmed = raw?.trim()
      if (trimmed) {
        collectionId.value = trimmed
      }
    } catch {
      /* ignore */
    }
  }
  await refreshHealth()
})

onUnmounted(() => {
  listPolling.stop()
})

onBeforeRouteLeave(async (_to, _from, next) => {
  if (literatureUploadRef.value?.isUploading()) {
    ElMessage.warning('正在上传文献，请等待完成后再切换页面')
    next(false)
    return
  }
  const cid = collectionId.value
  if (!cid) {
    next()
    return
  }
  try {
    await ElMessageBox.confirm(
      '当前已关联临时文献库，向量仍占用 Redis 与服务端元数据（至 TTL 或定时任务清理）。离开本页前是否立即删除整库？',
      '离开文献管理',
      {
        distinguishCancelAndClose: true,
        confirmButtonText: '删除服务端整库并离开',
        cancelButtonText: '保留临时库并离开',
        type: 'warning',
      }
    )
    try {
      await deleteLiteratureCollection(cid, silentAxiosConfig)
      collectionId.value = null
      files.value = []
    } catch (e) {
      ElMessage.error(getErrorMessage(e))
      next(false)
      return
    }
    next()
  } catch (action: unknown) {
    if (action === 'cancel') {
      next()
      return
    }
    next(false)
  }
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
      上传与解析文献向量（进入 Redis Stack，与知识库 metadata 隔离）；服务端按配置对临时库做 TTL
      滑动续期与定时清理。下方「检索试答」可在本页单次验库。问诊请选择「文献库」模式并指定本页临时库 ID。若当前已建临时库，切换到其它路由时会询问是否立即删除服务端整库（亦可保留至 TTL）；关闭或刷新本标签页时会尽力通过浏览器 Beacon 通知服务端释放（与 TTL 互补）。
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
      <p
        v-if="collectionExpiresLabel"
        class="ds-hint lit-ttl-hint"
      >
        {{ collectionExpiresLabel }}
      </p>
    </section>

    <section class="ds-card lit-ingest-card">
      <LiteratureUploadManager
        ref="literatureUploadRef"
        v-model:collection-id="collectionId"
        :load-files="loadFiles"
      />
      <LiteratureFileTable
        :files="files"
        :loading="loadingFiles"
        :collection-id="collectionId"
        @remove="removeFile"
      />
    </section>

    <LiteratureProbeChat :collection-id="collectionId" />
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
.lit-ingest-card {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
</style>

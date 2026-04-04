<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { silentAxiosConfig } from '@/api/core/client'
import { getErrorMessage } from '@/api/core/errors'
import DsAlert from '@/components/common/DsAlert.vue'
import DsSelect from '@/components/common/DsSelect.vue'
import type { DsSelectOption } from '@/components/common/DsSelect.vue'
import { getAgentConfig, getAgentHealth, updateAgentConfig } from '@/api/modules/agent'
import { listKnowledgeBases } from '@/api/modules/knowledge'
import type { KnowledgeBase } from '@/types/knowledge'
import {
  formatHealthStatus,
  isHealthStatusErr,
  isHealthStatusOk,
} from '@/utils/formatHealthStatus'

const health = ref('加载中…')
const bases = ref<KnowledgeBase[]>([])
const loading = ref(false)
const loadErr = ref<string | null>(null)
const saveMsg = ref<string | null>(null)
const saveErr = ref<string | null>(null)

const displayName = ref('')
const textSystemPrompt = ref('')
const visionSystemPrompt = ref('')
const visionModelName = ref('')
const defaultKnowledgeBaseId = ref<number | null>(null)

const defaultKbOptions = computed<DsSelectOption[]>(() => [
  { value: null, label: '不默认' },
  ...bases.value.map((b) => ({
    value: b.id,
    label: `${b.name} (id=${b.id})`,
  })),
])

async function refreshHealth() {
  try {
    const { data } = await getAgentHealth(silentAxiosConfig)
    health.value = formatHealthStatus(data.code, data.message ?? '')
  } catch (e) {
    health.value = getErrorMessage(e)
  }
}

async function loadBases() {
  try {
    const { data } = await listKnowledgeBases(silentAxiosConfig)
    if (data.code !== 0) throw new Error(data.message)
    bases.value = data.data ?? []
  } catch {
    bases.value = []
  }
}

async function loadConfig() {
  loadErr.value = null
  loading.value = true
  try {
    const { data } = await getAgentConfig(silentAxiosConfig)
    if (data.code !== 0) throw new Error(data.message)
    const c = data.data
    if (c) {
      displayName.value = c.displayName ?? ''
      textSystemPrompt.value = c.textSystemPrompt ?? ''
      visionSystemPrompt.value = c.visionSystemPrompt ?? ''
      visionModelName.value = c.visionModelName ?? ''
      defaultKnowledgeBaseId.value = c.defaultKnowledgeBaseId ?? null
    }
  } catch (e) {
    loadErr.value = getErrorMessage(e)
  } finally {
    loading.value = false
  }
}

async function saveConfig() {
  saveMsg.value = null
  saveErr.value = null
  loading.value = true
  try {
    const { data } = await updateAgentConfig(
      {
        displayName: displayName.value.trim() || '中医智能体',
        textSystemPrompt: textSystemPrompt.value.trim() || null,
        visionSystemPrompt: visionSystemPrompt.value.trim() || null,
        visionModelName: visionModelName.value.trim() || null,
        defaultKnowledgeBaseId: defaultKnowledgeBaseId.value,
      },
      silentAxiosConfig
    )
    if (data.code !== 0) throw new Error(data.message)
    saveMsg.value = '已保存'
    await loadConfig()
  } catch (e) {
    saveErr.value = getErrorMessage(e)
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await refreshHealth()
  await loadBases()
  await loadConfig()
})
</script>

<template>
  <div
    class="ds-page agent-page"
  >
    <h2 class="ds-h2">
      智能体配置
    </h2>
    <p class="ds-lead agent-lead">
      编排视觉 / 文本智能体的 System Prompt 与默认模型。JSON <code>/run</code> 默认启用 ReAct 工具循环（知识库检索
      <code>knowledge_retrieval_tool</code>、药材图 <code>herb_image_recognition_tool</code>）；问诊「视觉智能体」附图以 Base64 随 JSON
      提交（大图由前端自动压缩），直连多模态的 <code>multipart</code> 仍可供其它客户端使用。
    </p>
    <p
      class="ds-status agent-health"
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

    <DsAlert
      v-if="loadErr"
      class="agent-alert"
    >
      {{ loadErr }}
    </DsAlert>

    <section class="ds-card">
      <h3 class="ds-h3 ds-card__title">
        基本与模型
      </h3>
      <div class="agent-fields">
        <label class="ds-field agent-field-text">
          显示名称
          <input
            v-model="displayName"
            class="ds-input"
            type="text"
            maxlength="200"
            :disabled="loading"
          >
        </label>
        <label class="ds-field agent-field-text">
          默认视觉模型（Ollama）
          <input
            v-model="visionModelName"
            class="ds-input"
            type="text"
            placeholder="例如 qwen3-vl:2b"
            :disabled="loading"
          >
        </label>
        <label
          v-if="bases.length"
          class="ds-field agent-field-kb"
        >
          默认关联知识库（问诊视觉模式可预填）
          <DsSelect
            v-model="defaultKnowledgeBaseId"
            class="agent-kb-select"
            :options="defaultKbOptions"
            placeholder="不默认"
            :disabled="loading"
            aria-label="默认关联知识库"
          />
        </label>
      </div>
    </section>

    <section class="ds-card">
      <h3 class="ds-h3 ds-card__title">
        System Prompt
      </h3>
      <p class="ds-hint">
        留空则使用服务端内置默认文案。文本路径对应无图或「仅工具内看图」的 ReAct 任务；视觉 System 仍用于 multipart
        直连视觉模型等场景。
      </p>
      <label class="ds-field agent-prompt-field">
        文本智能体 System
        <textarea
          v-model="textSystemPrompt"
          class="ds-textarea"
          rows="8"
          :disabled="loading"
        />
      </label>
      <label class="ds-field agent-prompt-field">
        视觉智能体 System
        <textarea
          v-model="visionSystemPrompt"
          class="ds-textarea"
          rows="10"
          :disabled="loading"
        />
      </label>
    </section>

    <div class="agent-footer">
      <button
        type="button"
        class="ds-btn ds-btn--primary"
        :disabled="loading"
        @click="saveConfig"
      >
        {{ loading ? '处理中…' : '保存配置' }}
      </button>
      <button
        type="button"
        class="ds-btn ds-btn--secondary"
        :disabled="loading"
        @click="loadConfig"
      >
        重新加载
      </button>
    </div>
    <DsAlert
      v-if="saveMsg"
      variant="success"
      class="agent-alert"
    >
      {{ saveMsg }}
    </DsAlert>
    <DsAlert
      v-if="saveErr"
      class="agent-alert"
    >
      {{ saveErr }}
    </DsAlert>
  </div>
</template>

<style scoped>
.agent-page {
  max-width: 46rem;
}
.agent-lead {
  margin-top: -0.25rem;
  margin-bottom: 0.65rem;
  max-width: 40rem;
}
.agent-health {
  margin-bottom: 0.75rem;
}
.agent-fields {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.agent-field-text {
  max-width: min(100%, 28rem);
}
.agent-field-kb {
  max-width: min(100%, 28rem);
}
.agent-kb-select {
  margin-top: 0.35rem;
  width: 100%;
  max-width: min(100%, 28rem);
}
.agent-alert {
  margin: 0 0 0.85rem;
}
.agent-prompt-field {
  margin-top: 0.75rem;
}
.agent-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 1.25rem;
}
</style>

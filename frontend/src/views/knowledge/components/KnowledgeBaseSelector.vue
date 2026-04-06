<script setup lang="ts">
import { computed, ref } from 'vue'
import { silentAxiosConfig } from '@/api/core/client'
import { getErrorMessage } from '@/api/core/errors'
import { createKnowledgeBase } from '@/api/modules/knowledge'
import DsSelect from '@/components/common/DsSelect.vue'
import DsAlert from '@/components/common/DsAlert.vue'
import type { DsSelectOption } from '@/components/common/DsSelect.vue'
import type { KnowledgeBase } from '@/types/knowledge'

const props = defineProps<{
  bases: KnowledgeBase[]
}>()

const selectedId = defineModel<number | null>('selectedId', { required: true })

const emit = defineEmits<{
  /** 创建成功或需刷新列表时，由父组件执行 loadKnowledgeBases */
  reloadBases: []
}>()

const newBaseName = ref('默认知识库')
const newBaseEmbed = ref('bge-m3:latest')
const createSuccess = ref('')
const createError = ref<string | null>(null)

const baseSelectOptions = computed<DsSelectOption[]>(() => {
  if (props.bases.length === 0) {
    return [{ value: null, label: '请先创建知识库', disabled: true }]
  }
  return props.bases.map((b) => ({
    value: b.id,
    label: `${b.name} (id=${b.id})`,
  }))
})

async function createBase() {
  createSuccess.value = ''
  createError.value = null
  try {
    const { data } = await createKnowledgeBase(
      {
        name: newBaseName.value.trim() || '未命名知识库',
        embeddingModel: newBaseEmbed.value.trim() || 'bge-m3:latest',
      },
      silentAxiosConfig
    )
    if (data.code !== 0) throw new Error(data.message)
    emit('reloadBases')
    if (data.data) selectedId.value = data.data.id
    createSuccess.value = '知识库已创建'
  } catch (e) {
    createError.value = getErrorMessage(e)
  }
}
</script>

<template>
  <section class="ds-card">
    <h3 class="ds-h3 ds-card__title">
      知识库
    </h3>
    <div class="kb-card-stack">
      <label class="ds-field kb-field-current">
        当前库
        <DsSelect
          v-model="selectedId"
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
      <DsAlert
        v-if="createError"
        variant="error"
        class="kb-create-alert"
      >
        {{ createError }}
      </DsAlert>
      <p
        v-if="createSuccess"
        class="ds-msg--success kb-create-msg"
      >
        {{ createSuccess }}
      </p>
    </div>
  </section>
</template>

<style scoped>
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
.kb-create-alert {
  margin: 0;
}
.kb-create-msg {
  margin: 0;
}
</style>

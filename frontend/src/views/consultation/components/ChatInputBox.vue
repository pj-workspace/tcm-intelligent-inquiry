<script setup lang="ts">
import { computed, ref } from 'vue'

export type ChatInputSendPayload = {
  text: string
  images: File[]
}

const props = defineProps<{
  loading: boolean
}>()

const emit = defineEmits<{
  send: [payload: ChatInputSendPayload]
}>()

const inputText = ref('')
const pendingImages = ref<File[]>([])
const attachInput = ref<HTMLInputElement | null>(null)

function addImagesFromInput(fileList: FileList | null) {
  if (!fileList?.length) return
  const next: File[] = [...pendingImages.value]
  for (let i = 0; i < fileList.length; i++) {
    const f = fileList.item(i)
    if (f && f.type.startsWith('image/')) next.push(f)
  }
  pendingImages.value = next
}

function removeImageAt(index: number) {
  pendingImages.value = pendingImages.value.filter((_, i) => i !== index)
}

function clearPendingImages() {
  pendingImages.value = []
}

function onAttachClick() {
  attachInput.value?.click()
}

function onAttachChange(e: Event) {
  const el = e.target as HTMLInputElement
  addImagesFromInput(el.files)
  el.value = ''
}

const canSend = computed(
  () => Boolean(inputText.value.trim()) && !props.loading
)

function trySend() {
  const text = inputText.value.trim()
  if (!text || props.loading) return

  inputText.value = ''
  const images = [...pendingImages.value]
  emit('send', { text, images })
}

function onComposerKeydown(ev: KeyboardEvent) {
  if (ev.key !== 'Enter') return
  if (ev.shiftKey) return
  if (ev.isComposing || ev.keyCode === 229) return
  ev.preventDefault()
  trySend()
}

defineExpose({
  clearPendingImages,
})
</script>

<template>
  <form
    class="consult-composer"
    @submit.prevent="trySend"
  >
    <div
      v-if="pendingImages.length > 0"
      class="consult-attachments"
    >
      <span
        v-for="(f, idx) in pendingImages"
        :key="idx + f.name"
        class="consult-attachments__chip"
      >
        {{ f.name }}
        <button
          type="button"
          class="consult-attachments__x"
          :disabled="loading"
          @click="removeImageAt(idx)"
        >
          ×
        </button>
      </span>
      <span
        v-if="pendingImages.length > 1"
        class="ds-hint"
      >将使用第一张图调用接口</span>
    </div>
    <div class="consult-composer__shell">
      <input
        ref="attachInput"
        type="file"
        class="consult-composer__file"
        accept="image/*"
        multiple
        :disabled="loading"
        @change="onAttachChange"
      >
      <button
        type="button"
        class="ds-btn ds-btn--icon ds-btn--subtle consult-composer__attach"
        :disabled="loading"
        title="上传图片（可选，走药材识图工具）"
        aria-label="上传附件或图片"
        @click="onAttachClick"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="1.8"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3A1.5 1.5 0 0 0 1.5 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008H12V8.25Z"
          />
        </svg>
      </button>
      <el-input
        v-model="inputText"
        type="textarea"
        :autosize="{ minRows: 1, maxRows: 5 }"
        class="consult-composer__input"
        placeholder="描述症状、上传处方图说明、或基于文献提问…"
        :disabled="loading"
        @keydown="onComposerKeydown"
      />
      <button
        type="submit"
        class="ds-btn ds-btn--primary ds-btn--icon consult-composer__send"
        :disabled="!canSend"
        aria-label="发送"
        title="发送"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5"
          />
        </svg>
      </button>
    </div>
  </form>
</template>

<style scoped>
.consult-composer {
  margin-top: 1.25rem;
  padding-top: 0.25rem;
  flex-shrink: 0;
}

.consult-attachments {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.4rem;
}

.consult-attachments__chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  padding: 0.2rem 0.45rem;
  border-radius: var(--radius-sm);
  background: rgba(124, 58, 237, 0.08);
  border: 1px solid var(--color-border);
}

.consult-attachments__x {
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 0 0.15rem;
  line-height: 1;
  color: var(--color-muted);
  touch-action: manipulation;
  border-radius: var(--radius-sm);
  transition: transform 0.1s ease, color 0.15s ease;
}

.consult-attachments__x:hover:not(:disabled) {
  color: var(--color-danger);
}

.consult-attachments__x:active:not(:disabled) {
  transform: scale(0.9);
}

.consult-attachments__x:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.consult-composer__shell {
  position: relative;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  transition: var(--transition-fast);
  overflow: hidden;
}

.consult-composer__shell:focus-within {
  border-color: var(--color-secondary);
  box-shadow: var(--focus-ring);
}

.consult-composer__file {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}

.consult-composer__attach {
  position: absolute;
  bottom: 0.65rem;
  left: 0.55rem;
  z-index: 1;
  width: var(--ds-control-height);
  height: var(--ds-control-height);
  min-width: var(--ds-control-height);
  padding: 0;
  border-radius: var(--radius-control);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.consult-composer__input {
  --consult-composer-textarea-pad-y: 12px;
  --consult-composer-textarea-pad-x: 52px;
}

.consult-composer__input :deep(.el-textarea__inner) {
  display: block;
  width: 100%;
  margin: 0;
  box-sizing: border-box;
  padding: var(--consult-composer-textarea-pad-y) 60px
    var(--consult-composer-textarea-pad-y) var(--consult-composer-textarea-pad-x);
  font-family: var(--font-body);
  font-size: 0.9375rem;
  line-height: 1.5;
  color: var(--color-text);
  background: var(--color-surface);
  border: none;
  border-radius: var(--radius-md);
  outline: none;
  resize: none !important;
  box-shadow: none;
}

.consult-composer__input :deep(.el-textarea__inner::-webkit-resizer) {
  display: none;
  appearance: none;
}

.consult-composer__input :deep(.el-textarea__inner::placeholder) {
  color: var(--color-muted);
}

.consult-composer__input :deep(.el-textarea__inner:focus) {
  outline: none;
}

.consult-composer__send {
  position: absolute;
  bottom: 0.65rem;
  right: 0.65rem;
  width: var(--ds-control-height);
  height: var(--ds-control-height);
  border-radius: var(--radius-control);
}
</style>

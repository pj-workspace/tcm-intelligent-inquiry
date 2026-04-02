<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

export type DsSelectOption = {
  value: string | number | null
  label: string
  disabled?: boolean
}

const props = withDefaults(
  defineProps<{
    modelValue: string | number | null
    options: DsSelectOption[]
    placeholder?: string
    disabled?: boolean
    ariaLabel?: string
  }>(),
  {
    placeholder: '请选择',
    disabled: false,
    ariaLabel: undefined,
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: string | number | null]
}>()

const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const panelTop = ref('0px')
const panelLeft = ref('0px')
const panelMinWidth = ref('12rem')

const selectedLabel = computed(() => {
  const hit = props.options.find((o) => o.value === props.modelValue)
  return hit?.label ?? props.placeholder
})

async function positionPanel() {
  await nextTick()
  const el = rootRef.value
  if (!el) return
  const r = el.getBoundingClientRect()
  panelTop.value = `${r.bottom + 4}px`
  panelLeft.value = `${r.left}px`
  panelMinWidth.value = `${Math.max(r.width, 192)}px`
}

function toggle() {
  if (props.disabled) return
  open.value = !open.value
}

function selectOption(opt: DsSelectOption) {
  if (opt.disabled) return
  emit('update:modelValue', opt.value)
  open.value = false
}

function onDocClick(ev: MouseEvent) {
  if (!open.value) return
  const target = ev.target
  if (!(target instanceof Node)) return
  const root = rootRef.value
  const panel = panelRef.value
  if (root?.contains(target) || panel?.contains(target)) return
  open.value = false
}

function onKeydown(ev: KeyboardEvent) {
  if (props.disabled) return
  if (ev.key === 'Escape') open.value = false
}

function onScrollResize() {
  if (open.value) open.value = false
}

watch(open, async (v) => {
  if (v) await positionPanel()
})

watch(
  () => props.disabled,
  (d) => {
    if (d) open.value = false
  }
)

onMounted(() => {
  document.addEventListener('click', onDocClick, true)
  document.addEventListener('keydown', onKeydown)
  window.addEventListener('scroll', onScrollResize, true)
  window.addEventListener('resize', onScrollResize)
})

onUnmounted(() => {
  document.removeEventListener('click', onDocClick, true)
  document.removeEventListener('keydown', onKeydown)
  window.removeEventListener('scroll', onScrollResize, true)
  window.removeEventListener('resize', onScrollResize)
})
</script>

<template>
  <div
    ref="rootRef"
    class="ds-custom-select"
    :class="{ 'ds-custom-select--open': open, 'ds-custom-select--disabled': disabled }"
  >
    <button
      type="button"
      class="ds-custom-select__trigger"
      :disabled="disabled"
      :aria-expanded="open"
      :aria-haspopup="true"
      :aria-label="ariaLabel"
      @click.stop="toggle"
    >
      <span
        class="ds-custom-select__value"
        :class="{
          'ds-custom-select__value--placeholder':
            options.find((o) => o.value === modelValue) == null,
        }"
      >{{ selectedLabel }}</span>
      <span
        class="ds-custom-select__chev"
        aria-hidden="true"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </span>
    </button>
    <Teleport to="body">
      <transition name="ds-select-panel">
        <ul
          v-if="open"
          ref="panelRef"
          class="ds-custom-select__panel"
          role="listbox"
          :style="{
            top: panelTop,
            left: panelLeft,
            minWidth: panelMinWidth,
          }"
          @click.stop
        >
          <li
            v-for="(opt, i) in options"
            :key="i"
            role="option"
            :aria-selected="opt.value === modelValue"
            class="ds-custom-select__option"
            :class="{
              'ds-custom-select__option--active': opt.value === modelValue,
              'ds-custom-select__option--disabled': opt.disabled,
            }"
            @click="selectOption(opt)"
          >
            <span class="ds-custom-select__check">
              <svg
                v-if="opt.value === modelValue"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                aria-hidden="true"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </span>
            <span class="ds-custom-select__label">{{ opt.label }}</span>
          </li>
        </ul>
      </transition>
    </Teleport>
  </div>
</template>

<style scoped>
.ds-custom-select {
  position: relative;
  display: inline-block;
  min-width: 10rem;
  vertical-align: middle;
}

.ds-custom-select--disabled {
  opacity: 0.55;
  pointer-events: none;
}

.ds-custom-select__trigger {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  width: 100%;
  min-height: var(--ds-control-height);
  padding: 0 0.65rem 0 0.75rem;
  font-family: var(--font-body);
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text);
  background: var(--color-surface);
  border: 1px solid var(--color-border-neutral);
  border-radius: var(--radius-control);
  cursor: pointer;
  touch-action: manipulation;
  transition: var(--transition-fast), transform 0.1s cubic-bezier(0.33, 1, 0.68, 1);
  box-sizing: border-box;
}

.ds-custom-select__trigger:hover:not(:disabled) {
  border-color: #d1d5db;
  background: var(--color-surface-elevated);
}

.ds-custom-select__trigger:active:not(:disabled) {
  transform: scale(0.98);
  border-color: var(--color-secondary);
}

.ds-custom-select--open .ds-custom-select__trigger {
  border-color: var(--color-primary);
  box-shadow: var(--focus-ring);
}

.ds-custom-select__trigger:focus-visible {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: var(--focus-ring);
}

.ds-custom-select__value {
  flex: 1;
  min-width: 0;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ds-custom-select__value--placeholder {
  color: var(--color-muted);
  font-weight: 400;
}

.ds-custom-select__chev {
  flex-shrink: 0;
  color: var(--color-muted);
  display: flex;
  transition: transform 0.15s ease;
}

.ds-custom-select--open .ds-custom-select__chev {
  transform: rotate(180deg);
  color: var(--color-primary);
}
</style>

<style>
/* Teleport 到 body，非 scoped，避免面板无样式 */
.ds-custom-select__panel {
  position: fixed;
  z-index: 300;
  margin: 0;
  padding: 0.35rem 0;
  list-style: none;
  max-height: min(50vh, 16rem);
  overflow-y: auto;
  background: var(--color-surface);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-dropdown);
}

.ds-custom-select__option {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.45rem 0.65rem 0.45rem 0.5rem;
  font-size: 0.875rem;
  color: var(--color-text);
  cursor: pointer;
  touch-action: manipulation;
  transition: background-color 0.12s ease, transform 0.08s ease;
}

.ds-custom-select__option:hover:not(.ds-custom-select__option--disabled) {
  background: var(--color-option-hover);
}

.ds-custom-select__option:active:not(.ds-custom-select__option--disabled) {
  transform: scale(0.99);
  background: rgba(124, 58, 237, 0.12);
}

.ds-custom-select__option--active {
  font-weight: 600;
  color: var(--color-primary-hover);
}

.ds-custom-select__option--disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.ds-custom-select__check {
  flex-shrink: 0;
  width: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-primary);
}

.ds-custom-select__label {
  flex: 1;
  min-width: 0;
}

.ds-select-panel-enter-active,
.ds-select-panel-leave-active {
  transition:
    opacity 0.12s ease,
    transform 0.12s ease;
}
.ds-select-panel-enter-from,
.ds-select-panel-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>

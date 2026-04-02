<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'error' | 'success' | 'info'
  }>(),
  { variant: 'error' }
)
</script>

<template>
  <div
    class="ds-alert"
    :class="`ds-alert--${variant}`"
    role="alert"
  >
    <span
      class="ds-alert__icon"
      aria-hidden="true"
    >
      <svg
        v-if="variant === 'error'"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <circle
          cx="12"
          cy="12"
          r="10"
        />
        <path
          stroke-linecap="round"
          d="M12 8v5M12 16h.01"
        />
      </svg>
      <svg
        v-else-if="variant === 'success'"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M5 13l4 4L19 7"
        />
      </svg>
      <svg
        v-else
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <circle
          cx="12"
          cy="12"
          r="10"
        />
        <path
          stroke-linecap="round"
          d="M12 16v-4M12 8h.01"
        />
      </svg>
    </span>
    <div class="ds-alert__body">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.ds-alert {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  padding: 0.75rem 1rem;
  border-radius: var(--radius-md);
  font-size: 0.875rem;
  line-height: 1.5;
  border: 1px solid transparent;
}

.ds-alert__icon {
  flex-shrink: 0;
  margin-top: 0.06rem;
}

.ds-alert__body {
  flex: 1;
  min-width: 0;
}

.ds-alert--error {
  background: #fef2f2;
  border-color: #fecaca;
  color: #b91c1c;
}

.ds-alert--error .ds-alert__icon {
  color: #dc2626;
}

.ds-alert--success {
  background: #ecfdf5;
  border-color: #a7f3d0;
  color: #047857;
}

.ds-alert--success .ds-alert__icon {
  color: #059669;
}

.ds-alert--info {
  background: var(--color-primary-muted);
  border-color: var(--color-border-strong);
  color: var(--color-primary-hover);
}

.ds-alert--info .ds-alert__icon {
  color: var(--color-primary);
}
</style>

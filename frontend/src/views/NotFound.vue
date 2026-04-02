<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <div class="ds-not-found">
    <p class="ds-not-found-title">
      页面不存在
    </p>
    <p class="ds-not-found-hint">
      链接可能有误，或页面已被移动。
    </p>
    <RouterLink
      to="/consultation"
      class="ds-not-found-link"
    >
      返回问诊
    </RouterLink>
  </div>
</template>

<style scoped>
.ds-not-found {
  padding: 2rem;
  max-width: 28rem;
}
.ds-not-found-title {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 0 0 0.5rem;
}
.ds-not-found-hint {
  margin: 0 0 1rem;
  color: var(--color-text-secondary, #666);
}
.ds-not-found-link {
  display: inline-flex;
  align-items: center;
  color: var(--color-primary, #0d6efd);
  font-weight: 500;
  text-decoration: underline;
  text-underline-offset: 3px;
  touch-action: manipulation;
  transition: transform 0.1s ease, opacity 0.15s ease;
  border-radius: var(--radius-sm);
}

.ds-not-found-link:active {
  transform: scale(0.98);
  opacity: 0.85;
}

.ds-not-found-link:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.35);
}
</style>

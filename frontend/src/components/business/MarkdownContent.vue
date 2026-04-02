<script setup lang="ts">
/**
 * 兼容旧 props 名 `source`；实际渲染由 {@link MarkdownRenderer} 统一完成。
 */
import MarkdownRenderer from '@/components/common/MarkdownRenderer.vue'

const props = defineProps<{
  source: string
}>()
</script>

<template>
  <MarkdownRenderer
    :content="props.source"
    streaming
  />
</template>

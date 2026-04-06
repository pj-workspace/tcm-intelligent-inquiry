<script setup lang="ts">
/**
 * 兼容旧 props 名 `source`；实际渲染由 {@link MarkdownRenderer} 统一完成。
 */
import MarkdownRenderer from '@/components/common/MarkdownRenderer.vue'

const props = withDefaults(
  defineProps<{
    source: string
    /** 是否对流式 fence 做补全；已在闸门后聚合的安全块可传 false，减少重复试探 */
    streaming?: boolean
  }>(),
  { streaming: true }
)
</script>

<template>
  <MarkdownRenderer
    :content="props.source"
    :streaming="props.streaming"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  markdownToSafeHtml,
  type MarkdownRenderOptions,
} from '@/utils/renderMarkdown'

const props = withDefaults(
  defineProps<{
    /** Markdown 源码（含流式累积片段） */
    content: string
    /** 是否启用流式围栏补全，默认 true */
    streaming?: boolean
  }>(),
  { streaming: true }
)

const renderOpts = computed<MarkdownRenderOptions>(() => ({
  streaming: props.streaming,
}))

const html = computed(() =>
  markdownToSafeHtml(props.content, renderOpts.value)
)
</script>

<template>
  <div
    class="md-renderer ds-markdown"
    v-html="html"
  />
</template>

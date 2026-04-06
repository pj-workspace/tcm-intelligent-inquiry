import { ref, type Ref } from 'vue'
import { ElMessage } from 'element-plus'
import { silentAxiosConfig } from '@/api/core/client'
import { getErrorMessage } from '@/api/core/errors'
import { uploadKnowledgeDocument } from '@/api/modules/knowledge'
import { validateIngestChunkParams } from '@/utils/chunkUploadParams'

export type UseKnowledgeUploadOptions = {
  knowledgeBaseId: Ref<number | null>
  loadFiles: () => Promise<void>
}

/**
 * 知识库文档分片上传：参数校验、多文件依次上传、汇总结果文案（与文献页一致的错误提示方式）。
 */
export function useKnowledgeUpload({
  knowledgeBaseId,
  loadFiles,
}: UseKnowledgeUploadOptions) {
  const uploading = ref(false)
  const msg = ref('')
  const chunkSize = ref(512)
  /** 码点重叠；>0 时后端走滑动窗口，此时 chunkSize 表示码点窗口长度（建议 ≥128） */
  const chunkOverlap = ref(0)

  async function handleUpload(e: Event) {
    const input = e.target as HTMLInputElement
    const list = input.files
    input.value = ''
    if (!list?.length || knowledgeBaseId.value == null) return
    const paramErr = validateIngestChunkParams(chunkSize.value, chunkOverlap.value)
    if (paramErr) {
      ElMessage.error(paramErr)
      return
    }
    uploading.value = true
    msg.value = ''
    const total = list.length
    const errors: string[] = []
    let ok = 0
    const kbId = knowledgeBaseId.value
    try {
      for (let i = 0; i < total; i++) {
        const f = list[i]!
        if (total > 1) {
          msg.value = `上传中 ${i + 1}/${total}：${f.name}…`
        }
        try {
          const fd = new FormData()
          fd.append('file', f)
          if (chunkSize.value > 32) {
            fd.append('chunkSize', String(chunkSize.value))
          }
          if (chunkOverlap.value > 0) {
            fd.append('chunkOverlap', String(chunkOverlap.value))
          }
          const { data } = await uploadKnowledgeDocument(
            kbId,
            fd,
            silentAxiosConfig
          )
          if (data.code !== 0) throw new Error(data.message)
          ok++
        } catch (err) {
          errors.push(`${f.name}：${getErrorMessage(err)}`)
        }
      }
      await loadFiles()
      if (errors.length === 0) {
        msg.value =
          total === 1 && list[0]
            ? `已入库：${list[0].name}`
            : `已依次入库 ${ok} 个文件`
      } else {
        msg.value =
          ok > 0
            ? `部分失败（成功 ${ok}/${total}）\n${errors.join('\n')}`
            : errors.join('\n')
      }
    } finally {
      uploading.value = false
    }
  }

  return {
    chunkSize,
    chunkOverlap,
    uploading,
    msg,
    handleUpload,
  }
}

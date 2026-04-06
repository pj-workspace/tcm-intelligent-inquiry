import { ref, watch } from 'vue'

const STORAGE_KEY = 'tcm-omni-chat-prefs'

type Persisted = {
  knowledgeBaseId: number | null
  /** 空字符串表示未选 */
  literatureCollectionId: string
}

function loadPersisted(): Persisted | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as Partial<Persisted>
    return {
      knowledgeBaseId:
        typeof o.knowledgeBaseId === 'number' ? o.knowledgeBaseId : null,
      literatureCollectionId:
        typeof o.literatureCollectionId === 'string'
          ? o.literatureCollectionId
          : '',
    }
  } catch {
    return null
  }
}

function savePersisted(p: Persisted) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p))
  } catch {
    /* ignore */
  }
}

/**
 * 问诊侧偏好：可选默认知识库 / 文献库 ID（持久化至 localStorage）。
 * 待发附图由问诊页的输入区组件（如 ChatInputBox）自行维护。
 */
export function useOmniChatContext() {
  const saved = loadPersisted()

  const knowledgeBaseId = ref<number | null>(saved?.knowledgeBaseId ?? null)
  const literatureCollectionId = ref<string>(
    saved?.literatureCollectionId ?? ''
  )

  function persistNow() {
    savePersisted({
      knowledgeBaseId: knowledgeBaseId.value,
      literatureCollectionId:
        literatureCollectionId.value.trim() === ''
          ? ''
          : literatureCollectionId.value.trim(),
    })
  }

  watch([knowledgeBaseId, literatureCollectionId], persistNow, { deep: true })

  return {
    knowledgeBaseId,
    literatureCollectionId,
  }
}

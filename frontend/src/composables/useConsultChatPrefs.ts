import { ref, watch } from 'vue'

import {
  DEFAULT_CONSULT_MODEL_PREFS,
  normalizeConsultModelPrefs,
  type ConsultModelPrefs,
} from '@/utils/consultModelPrefs'

/** 与模式、挂载项 key 并列：问诊数值参数跨刷新保留 */
const MODEL_STORAGE_KEY = 'tcm-consult-chat-model-prefs'
/** 设置齿轮面板与高级折叠：仅当前标签会话内保留，避免新开标签默认弹出面板 */
const SESSION_UI_KEY = 'tcm-consult-settings-ui'

type SessionUiPrefs = {
  settingsOpen: boolean
  advOpen: boolean
}

function loadModelPrefs(): ConsultModelPrefs {
  try {
    const raw = localStorage.getItem(MODEL_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_CONSULT_MODEL_PREFS }
    return normalizeConsultModelPrefs(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_CONSULT_MODEL_PREFS }
  }
}

function saveModelPrefs(p: ConsultModelPrefs) {
  try {
    localStorage.setItem(MODEL_STORAGE_KEY, JSON.stringify(p))
  } catch {
    /* 隐私模式或配额满时静默失败 */
  }
}

function loadSessionUi(): SessionUiPrefs {
  try {
    const raw = sessionStorage.getItem(SESSION_UI_KEY)
    if (!raw) return { settingsOpen: false, advOpen: false }
    const j = JSON.parse(raw) as Record<string, unknown>
    return {
      settingsOpen: Boolean(j.settingsOpen),
      advOpen: Boolean(j.advOpen),
    }
  } catch {
    return { settingsOpen: false, advOpen: false }
  }
}

function saveSessionUi(p: SessionUiPrefs) {
  try {
    sessionStorage.setItem(SESSION_UI_KEY, JSON.stringify(p))
  } catch {
    /* ignore */
  }
}

/**
 * 问诊 ChatView 专用：模型/RAG 偏好持久化（localStorage）+ 设置面板/高级区展开态（sessionStorage）。
 */
export function useConsultChatPrefs() {
  const initial = loadModelPrefs()
  const temperature = ref(initial.temperature)
  const topP = ref(initial.topP)
  const maxHistoryTurns = ref(initial.maxHistoryTurns)
  const ragTopK = ref(initial.ragTopK)
  const ragSimilarityThreshold = ref(initial.ragSimilarityThreshold)
  const literatureTopK = ref(initial.literatureTopK)
  const literatureThreshold = ref(initial.literatureThreshold)

  watch(
    [
      temperature,
      topP,
      maxHistoryTurns,
      ragTopK,
      ragSimilarityThreshold,
      literatureTopK,
      literatureThreshold,
    ],
    () => {
      saveModelPrefs(
        normalizeConsultModelPrefs({
          temperature: temperature.value,
          topP: topP.value,
          maxHistoryTurns: maxHistoryTurns.value,
          ragTopK: ragTopK.value,
          ragSimilarityThreshold: ragSimilarityThreshold.value,
          literatureTopK: literatureTopK.value,
          literatureThreshold: literatureThreshold.value,
        })
      )
    },
    { deep: true }
  )

  const su = loadSessionUi()
  const settingsOpen = ref(su.settingsOpen)
  const advOpen = ref(su.advOpen)

  watch([settingsOpen, advOpen], () => {
    saveSessionUi({
      settingsOpen: settingsOpen.value,
      advOpen: advOpen.value,
    })
  })

  /** 原生 <details> 的 toggle 事件与 v-model 不同步时，用事件回写展开态 */
  function onConsultAdvToggle(ev: Event) {
    const el = ev.target
    if (!(el instanceof HTMLDetailsElement)) return
    advOpen.value = el.open
  }

  return {
    temperature,
    topP,
    maxHistoryTurns,
    ragTopK,
    ragSimilarityThreshold,
    literatureTopK,
    literatureThreshold,
    settingsOpen,
    advOpen,
    onConsultAdvToggle,
  }
}

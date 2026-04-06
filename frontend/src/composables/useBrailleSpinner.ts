import { computed, onUnmounted, ref, watch, type Ref } from 'vue'

/** claw-code 终端 Spinner 同款 Braille 帧序列，用于轻量「编排进行中」动效 */
const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

/**
 * 在 isActive 为 true 时循环切换帧；关闭时复位，避免卸载后定时器泄漏。
 */
export function useBrailleSpinner(isActive: Ref<boolean>) {
  const frameIdx = ref(0)
  let timer: ReturnType<typeof setInterval> | null = null

  function stop() {
    if (timer != null) {
      clearInterval(timer)
      timer = null
    }
    frameIdx.value = 0
  }

  watch(
    isActive,
    (on) => {
      stop()
      if (!on) return
      timer = setInterval(() => {
        frameIdx.value = (frameIdx.value + 1) % FRAMES.length
      }, 90)
    },
    { immediate: true }
  )

  onUnmounted(stop)

  const spinChar = computed(() => FRAMES[frameIdx.value]!)

  return { spinChar }
}

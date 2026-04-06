import { onUnmounted } from 'vue'

export type SmartIngestListPollingOptions = {
  /** 轮询间隔（毫秒），默认 4000 */
  intervalMs?: number
}

/**
 * 异步入库场景下的列表「智能轮询」：在存在进行中记录时维持单一定时器，全部终态后自动释放。
 * 与 {@code loadFiles} 配合：每次加载结束后调用 {@link reconcile}；通过 {@code loadBusy} 由调用方跳过重叠请求。
 */
export function useSmartIngestListPolling(options?: SmartIngestListPollingOptions) {
  const intervalMs = options?.intervalMs ?? 4000
  /** 浏览器环境与 Node 类型定义对定时器 ID 不一致，这里按 DOM 数值句柄处理 */
  let intervalId: number | null = null
  let tickHandler: (() => void) | null = null

  function stop() {
    if (intervalId != null) {
      window.clearInterval(intervalId)
      intervalId = null
    }
    tickHandler = null
  }

  /**
   * @param shouldPoll 当前列表是否仍存在排队/处理中项
   * @param tick 每次定时触发时执行的回调（通常即再次 {@code loadFiles}）
   */
  function reconcile(shouldPoll: boolean, tick: () => void) {
    tickHandler = tick
    if (shouldPoll) {
      if (intervalId == null) {
        intervalId = window.setInterval(() => {
          tickHandler?.()
        }, intervalMs)
      }
    } else {
      stop()
    }
  }

  onUnmounted(stop)

  return { reconcile, stop }
}

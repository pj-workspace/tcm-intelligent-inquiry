/**
 * 流式 Markdown 安全切分边界（移植自 claw-code `find_stream_safe_boundary`）：
 * 仅在「围栏代码块已闭合」或「围栏外出现空行」处返回切分下标，避免半段列表/标题被 markdown-it 误解析导致闪烁。
 *
 * 参考：claw-code `rust/crates/rusty-claude-cli/src/render.rs`
 */
export function findStreamSafeBoundary(markdown: string): number | null {
  let inFence = false
  let lastBoundary: number | null = null
  let offset = 0

  const lines = markdown.split(/(?<=\n)/)

  for (const line of lines) {
    const trimmed = line.trimStart()
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      inFence = !inFence
      if (!inFence) {
        lastBoundary = offset + line.length
      }
      offset += line.length
      continue
    }

    if (inFence) {
      offset += line.length
      continue
    }

    if (trimmed.length === 0) {
      lastBoundary = offset + line.length
    }
    offset += line.length
  }

  return lastBoundary
}

export type MarkdownRestStreamGate = {
  /** 已越过安全边界的正文前缀，可交给 markdown-it 渲染 */
  committed: string
  /** 尚未凑满安全边界的尾部；UI 上以 escape 纯文本展示，避免半段语法抖动 */
  pending: string
}

/**
 * 将模型增量合并进「正文 rest」闸门：维持 committed + pending === rest。
 */
export function advanceMarkdownRestGate(
  gate: MarkdownRestStreamGate,
  restFull: string
): MarkdownRestStreamGate {
  const prev = gate.committed + gate.pending
  if (restFull === prev) {
    return gate
  }
  if (restFull.length < prev.length || !restFull.startsWith(prev)) {
    return drainPendingFromSuffix({ committed: '', pending: restFull })
  }
  const delta = restFull.slice(prev.length)
  return drainPendingFromSuffix({
    committed: gate.committed,
    pending: gate.pending + delta,
  })
}

function drainPendingFromSuffix(gate: MarkdownRestStreamGate): MarkdownRestStreamGate {
  let committed = gate.committed
  let pending = gate.pending

  for (;;) {
    const b = findStreamSafeBoundary(pending)
    if (b == null || b === 0) {
      break
    }
    committed += pending.slice(0, b)
    pending = pending.slice(b)
  }
  return { committed, pending }
}

/** 流结束：将剩余 pending 一律并入 committed（最终由 markdown-it + 现有 stabilize 处理半截围栏）。 */
export function finalizeMarkdownRestGate(
  gate: MarkdownRestStreamGate
): MarkdownRestStreamGate {
  if (!gate.pending) return gate
  return {
    committed: gate.committed + gate.pending,
    pending: '',
  }
}

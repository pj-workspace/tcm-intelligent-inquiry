import { describe, expect, it } from 'vitest'
import {
  advanceMarkdownRestGate,
  finalizeMarkdownRestGate,
  findStreamSafeBoundary,
} from './markdownStreamBoundary'

describe('findStreamSafeBoundary', () => {
  it('文档 claw 用例：标题块需待空行后才可 flush', () => {
    expect(findStreamSafeBoundary('# Heading')).toBeNull()
    const withPara = '# Heading\n\nParagraph\n\n'
    const b = findStreamSafeBoundary(withPara)
    expect(b).toBe(withPara.length)
  })

  it('闭合围栏后可切分', () => {
    const mid = '```rust\nfn main() {}\n'
    expect(findStreamSafeBoundary(mid)).toBeNull()
    const closed = mid + '```\n'
    const b = findStreamSafeBoundary(closed)
    expect(b).toBe(closed.length)
  })
})

describe('advanceMarkdownRestGate', () => {
  it('按增量推进并在空行边界 drain', () => {
    let gate = { committed: '', pending: '' }
    gate = advanceMarkdownRestGate(gate, '# H\n\n')
    expect(gate.committed).toBe('# H\n\n')
    expect(gate.pending).toBe('')
  })

  it('结束时 finalize 吞掉尾部', () => {
    let gate = advanceMarkdownRestGate(
      { committed: '', pending: '' },
      '单行无空行'
    )
    expect(gate.pending.length).toBeGreaterThan(0)
    gate = finalizeMarkdownRestGate(gate)
    expect(gate.committed).toBe('单行无空行')
    expect(gate.pending).toBe('')
  })
})

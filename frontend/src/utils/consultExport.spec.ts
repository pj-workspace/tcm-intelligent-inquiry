import { describe, expect, it } from 'vitest'
import { buildConsultationMarkdown, sanitizeExportFilename } from './consultExport'
import type { ChatTurn } from '@/composables/useChat'

describe('consultExport', () => {
  it('buildConsultationMarkdown 交替输出患者与助手段落', () => {
    const turns: ChatTurn[] = [
      { role: 'user', content: '头痛三天' },
      { role: 'assistant', content: '建议辨证…' },
    ]
    const md = buildConsultationMarkdown(
      '测试会话',
      turns,
      null,
      '2026-04-04 10:00'
    )
    expect(md).toContain('# 测试会话')
    expect(md).toContain('## 患者')
    expect(md).toContain('头痛三天')
    expect(md).toContain('## 助手')
    expect(md).toContain('建议辨证')
  })

  it('streamingPart 非空时追加未完成片段标题', () => {
    const md = buildConsultationMarkdown('s', [], '还在打字', 't')
    expect(md).toContain('生成中')
    expect(md).toContain('还在打字')
  })

  it('sanitizeExportFilename 去除非法字符', () => {
    expect(sanitizeExportFilename('a/b|c')).toBe('a_b_c')
  })
})

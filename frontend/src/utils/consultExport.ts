import type { ChatTurn } from '@/composables/useChat'
import { stripJsonReportBlocks } from '@/utils/consultMarkdownCleanup'

/** 文件名中不允许的字符，避免下载失败或跨平台路径问题 */
const FILENAME_UNSAFE = /[/\\?%*:|"<>]/g

const REDACTED_THINKING_BLOCKS: RegExp[] = [
  /<redacted_thinking>[\s\S]*?<\/redacted_thinking>/gi,
  /<redacted_thinking>[\s\S]*?<\/think>/gi,
]

const THINK_FENCE =
  /\u0060think\u0060[\s\S]*?\u0060\/think\u0060/g

/**
 * 导出前清洗：去掉 json-report、推理块等 machine-oriented 片段。
 */
export function scrubMessageTextForExport(raw: string | null | undefined): string {
  try {
    let t = typeof raw === 'string' ? raw : ''
    for (const re of REDACTED_THINKING_BLOCKS) {
      t = t.replace(re, '')
    }
    t = t.replace(THINK_FENCE, '')
    t = stripJsonReportBlocks(t)
    return t.replace(/\n{3,}/g, '\n\n').trimEnd()
  } catch {
    return typeof raw === 'string' ? raw.trim() : ''
  }
}

/**
 * 将当前会话的多轮对话编排为 Markdown 文档（患者 / 助手交替）。
 * 结构简单稳定，便于用户二次编辑或纳入病历归档流程。
 */
export function buildConsultationMarkdown(
  sessionTitle: string,
  turns: ChatTurn[],
  /** 流式尚未结束时，可把当前已生成片段附在文末并标注「未完成」 */
  streamingPart: string | null | undefined,
  exportedAtLabel: string
): string {
  const lines: string[] = [
    `# ${sessionTitle}`,
    '',
    `> 导出时间：${exportedAtLabel}`,
    '',
    '---',
    '',
  ]

  for (const m of turns) {
    const label = m.role === 'user' ? '患者' : '助手'
    const body = scrubMessageTextForExport(m.content)
    lines.push(`## ${label}`, '', body || '（空）', '')
  }

  if (streamingPart != null && streamingPart.trim() !== '') {
    lines.push(
      '## 助手（生成中，导出快照）',
      '',
      scrubMessageTextForExport(streamingPart) || '（空）',
      ''
    )
  }

  return lines.join('\n').trimEnd() + '\n'
}

export function sanitizeExportFilename(raw: string, maxLen = 40): string {
  const t = raw.replace(FILENAME_UNSAFE, '_').trim() || '问诊记录'
  return t.length > maxLen ? `${t.slice(0, maxLen)}…` : t
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function downloadConsultationMarkdownFile(
  sessionTitle: string,
  turns: ChatTurn[],
  streamingPart: string | null | undefined
) {
  const label = new Date().toLocaleString()
  const body = buildConsultationMarkdown(
    sessionTitle,
    turns,
    streamingPart,
    label
  )
  const safe = sanitizeExportFilename(sessionTitle)
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  downloadBlob(
    `${safe}-${stamp}.md`,
    new Blob([body], { type: 'text/markdown;charset=utf-8' })
  )
}

/**
 * 构建离屏 DOM：使用系统字体由浏览器排版，html2canvas 截图后可正确包含中文，
 * 避免 jsPDF 默认内置字体不支持 CJK 的问题。
 */
export function buildConsultationExportHost(
  sessionTitle: string,
  turns: ChatTurn[],
  streamingPart: string | null | undefined,
  exportedAtLabel: string
): HTMLDivElement {
  const host = document.createElement('div')
  host.setAttribute('data-consult-export', '1')
  host.style.cssText = [
    'position:fixed',
    'left:-10000px',
    'top:0',
    'width:720px',
    'box-sizing:border-box',
    'padding:28px 32px',
    'background:#ffffff',
    'color:#1a1a1a',
    'font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif',
    'font-size:15px',
    'line-height:1.65',
  ].join(';')

  const titleEl = document.createElement('h1')
  titleEl.style.cssText =
    'font-size:22px;margin:0 0 12px;font-weight:650;letter-spacing:0.02em'
  titleEl.textContent = sessionTitle
  host.appendChild(titleEl)

  const meta = document.createElement('p')
  meta.style.cssText = 'margin:0 0 20px;color:#555;font-size:13px'
  meta.textContent = `导出时间：${exportedAtLabel}`
  host.appendChild(meta)

  const hr = document.createElement('hr')
  hr.style.cssText = 'border:none;border-top:1px solid #e5e5e5;margin:0 0 20px'
  host.appendChild(hr)

  const appendBlock = (subtitle: string, text: string) => {
    const h = document.createElement('h2')
    h.style.cssText =
      'font-size:16px;margin:22px 0 10px;font-weight:600;color:#111'
    h.textContent = subtitle
    host.appendChild(h)
    const p = document.createElement('div')
    p.style.cssText = 'white-space:pre-wrap;word-break:break-word;margin:0'
    p.textContent = text
    host.appendChild(p)
  }

  for (const m of turns) {
    const label = m.role === 'user' ? '患者' : '助手'
    const text = scrubMessageTextForExport(m.content) || '（空）'
    appendBlock(label, text)
  }

  if (streamingPart != null && streamingPart.trim() !== '') {
    appendBlock(
      '助手（生成中，导出快照）',
      scrubMessageTextForExport(streamingPart) || '（空）'
    )
  }

  return host
}

/**
 * 将离屏节点绘制成位图后分页写入 PDF（A4 竖版）。
 * 分页算法与常见「长图切片」一致：同一 data URL 多次 addImage，靠负向 y 偏移展示不同垂直区域。
 */
export async function downloadConsultationPdfFromHost(host: HTMLDivElement) {
  const html2canvas = (await import('html2canvas')).default
  const { jsPDF } = await import('jspdf')

  document.body.appendChild(host)
  let canvas: HTMLCanvasElement
  try {
    canvas = await html2canvas(host, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    })
  } finally {
    host.remove()
  }

  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()

  const imgWidth = pageWidth
  const imgHeight = (canvas.height * imgWidth) / canvas.width
  const imgData = canvas.toDataURL('image/png')

  let heightLeft = imgHeight
  let position = 0

  pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
  heightLeft -= pageHeight

  while (heightLeft > 0) {
    position = heightLeft - imgHeight
    pdf.addPage()
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
    heightLeft -= pageHeight
  }
  return pdf
}

export async function downloadConsultationPdfFile(
  sessionTitle: string,
  turns: ChatTurn[],
  streamingPart: string | null | undefined
) {
  const label = new Date().toLocaleString()
  const host = buildConsultationExportHost(
    sessionTitle,
    turns,
    streamingPart,
    label
  )
  const pdf = await downloadConsultationPdfFromHost(host)
  const safe = sanitizeExportFilename(sessionTitle)
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  pdf.save(`${safe}-${stamp}.pdf`)
}

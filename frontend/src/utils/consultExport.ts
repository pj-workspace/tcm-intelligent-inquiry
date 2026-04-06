import type { ChatTurn } from '@/composables/useChat'
import type { HerbSafetyCheckResult, TcmDiagnosisReport } from '@/types/consultation'
import { stripJsonReportBlocks } from '@/utils/diagnosisReport'

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

function escapeMdCell(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>')
}

/**
 * 将结构化辨证摘要渲染为 Markdown 表格 + 配伍说明（供导出）。
 */
export function formatDiagnosisReportMarkdownAppendix(
  r: TcmDiagnosisReport,
  herbSafety?: HerbSafetyCheckResult | null
): string {
  const lines: string[] = [
    '',
    '### 辨证摘要（可读版）',
    '',
    '| 项目 | 内容 |',
    '| --- | --- |',
    `| 证候 | ${escapeMdCell(r.pattern || '—')} |`,
    `| 病机分析 | ${escapeMdCell(r.reasoning || '—')} |`,
    `| 参考方剂 | ${escapeMdCell(r.formula?.trim() ? r.formula.trim() : '—')} |`,
    `| 组成药材 | ${escapeMdCell(r.herbs?.length ? r.herbs.join('、') : '—')} |`,
    `| 调理建议 | ${escapeMdCell(r.lifestyle?.length ? r.lifestyle.join('；') : '—')} |`,
    '',
    '#### 配伍安全（系统自动扫描，仅供参考）',
    '',
  ]
  if (herbSafety == null) {
    lines.push(
      '_本段历史消息未附带配伍扫描结果；用药请遵医嘱。_',
      ''
    )
  } else if (herbSafety.safe && !herbSafety.warnings?.length) {
    lines.push(
      '> **结论**：根据内置「十八反」「十九畏」字面规则，**未发现**明显冲突药对。',
      '> **提醒**：仅此辅助参考，**请遵医嘱**，不可替代执业审方。',
      ''
    )
  } else {
    lines.push(
      '> **提醒**：**仅供参考，请遵医嘱**；以下为系统检出的字面禁忌提示：',
      ''
    )
    for (const w of herbSafety.warnings ?? []) {
      lines.push(`- ⚠ ${escapeMdCell(w)}`, '')
    }
  }
  return lines.join('\n')
}

function appendDiagnosisPdfBlock(
  host: HTMLElement,
  r: TcmDiagnosisReport,
  herbSafety?: HerbSafetyCheckResult | null
) {
  const wrap = document.createElement('div')
  wrap.style.cssText = 'margin-top:16px;padding:12px 14px;border:1px solid #e5e5e5;border-radius:8px;background:#fafafa'

  const h3 = document.createElement('h3')
  h3.style.cssText = 'margin:0 0 10px;font-size:15px;font-weight:650'
  h3.textContent = '辨证摘要（可读版）'
  wrap.appendChild(h3)

  const tbl = document.createElement('table')
  tbl.style.cssText = 'width:100%;border-collapse:collapse;font-size:14px'
  const addRow = (k: string, v: string) => {
    const tr = document.createElement('tr')
    const td1 = document.createElement('td')
    td1.style.cssText =
      'border:1px solid #ddd;padding:8px 10px;width:100px;font-weight:600;background:#f3f4f6'
    td1.textContent = k
    const td2 = document.createElement('td')
    td2.style.cssText = 'border:1px solid #ddd;padding:8px 10px;word-break:break-word'
    td2.textContent = v
    tr.appendChild(td1)
    tr.appendChild(td2)
    tbl.appendChild(tr)
  }
  addRow('证候', r.pattern || '—')
  addRow('病机分析', r.reasoning || '—')
  addRow('参考方剂', r.formula?.trim() ? r.formula.trim() : '—')
  addRow('组成药材', r.herbs?.length ? r.herbs.join('、') : '—')
  addRow('调理建议', r.lifestyle?.length ? r.lifestyle.join('；') : '—')
  wrap.appendChild(tbl)

  const safeH = document.createElement('h4')
  safeH.style.cssText = 'margin:14px 0 8px;font-size:14px;font-weight:650'
  safeH.textContent = '配伍安全（仅供参考，请遵医嘱）'
  wrap.appendChild(safeH)

  const safeP = document.createElement('div')
  safeP.style.cssText = 'font-size:13px;line-height:1.55;color:#333'
  if (herbSafety == null) {
    safeP.textContent =
      '本段未附带配伍扫描结果。任何用药须由执业医师或药师审定。'
  } else if (herbSafety.safe && !herbSafety.warnings?.length) {
    safeP.textContent =
      '根据内置「十八反」「十九畏」字面规则，未发现明显冲突药对。此结果不能替代执业审方。'
  } else {
    const ul = document.createElement('ul')
    ul.style.cssText = 'margin:0;padding-left:1.2em;color:#b91c1c'
    for (const w of herbSafety.warnings ?? ['存在潜在配伍风险']) {
      const li = document.createElement('li')
      li.textContent = w
      ul.appendChild(li)
    }
    safeP.appendChild(ul)
  }
  wrap.appendChild(safeP)

  host.appendChild(wrap)
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
    if (m.role === 'assistant' && m.diagnosisReport) {
      try {
        lines.push(
          formatDiagnosisReportMarkdownAppendix(
            m.diagnosisReport,
            m.herbSafety
          )
        )
      } catch {
        /* 结构化字段异常时仍导出正文 */
      }
    }
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
    if (m.role === 'assistant' && m.diagnosisReport) {
      try {
        appendDiagnosisPdfBlock(host, m.diagnosisReport, m.herbSafety)
      } catch {
        /* ignore */
      }
    }
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

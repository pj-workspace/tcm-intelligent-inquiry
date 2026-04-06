import type {
  KnowledgeRetrievedPassage,
  KnowledgeRetrievalMatchTypeWire,
} from '@/types/knowledge'

const MATCH_WIRES: ReadonlySet<string> = new Set(['semantic', 'keyword', 'hybrid'])

export function normalizeMetaPassages(raw: unknown): KnowledgeRetrievedPassage[] {
  if (!Array.isArray(raw)) return []
  const out: KnowledgeRetrievedPassage[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const index = typeof o.index === 'number' && Number.isFinite(o.index) ? o.index : out.length + 1
    const documentId = typeof o.documentId === 'string' ? o.documentId : ''
    const source = typeof o.source === 'string' ? o.source : ''
    const mtRaw = typeof o.matchType === 'string' ? o.matchType.toLowerCase() : 'semantic'
    const matchType: KnowledgeRetrievalMatchTypeWire = MATCH_WIRES.has(mtRaw)
      ? (mtRaw as KnowledgeRetrievalMatchTypeWire)
      : 'semantic'
    const score = typeof o.score === 'number' && Number.isFinite(o.score) ? o.score : 0
    const excerpt = typeof o.excerpt === 'string' ? o.excerpt : ''
    const channel = typeof o.channel === 'string' ? o.channel : 'knowledge'
    out.push({ index, documentId, source, matchType, score, excerpt, channel })
  }
  return out
}

/** 从用户问句提取 2 字及以上连续汉字，用于片段内高亮（与混合检索关键词弱对齐）。 */
export function extractQueryHighlightTerms(query: string): string[] {
  if (!query || typeof query !== 'string') return []
  const matches = query.match(/[\u4e00-\u9fff]{2,}/g)
  if (!matches) return []
  const uniq = [...new Set(matches)]
  return uniq.sort((a, b) => b.length - a.length)
}

export function matchTypeLabel(w: KnowledgeRetrievalMatchTypeWire): string {
  if (w === 'semantic') return '语义'
  if (w === 'keyword') return '关键词'
  return '混合'
}

export function channelLabel(ch: string | undefined): string {
  if (ch === 'literature') return '文献库'
  return '知识库'
}

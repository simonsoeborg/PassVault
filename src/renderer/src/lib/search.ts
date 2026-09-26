import type { EntrySummary } from '../../../shared/types'

/**
 * Ranks entries for a query. Every whitespace-separated term must match somewhere;
 * title prefix matches rank highest, then word starts in the title, then anywhere.
 */
export function searchEntries(entries: EntrySummary[], query: string, limit = Infinity): EntrySummary[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return entries.slice(0, limit)
  const scored: Array<{ entry: EntrySummary; score: number }> = []
  for (const entry of entries) {
    const title = entry.title.toLowerCase()
    let score = 0
    let matched = true
    for (const term of terms) {
      if (title.startsWith(term)) score += 100
      else if (new RegExp(`(^|[\\s._@/-])${escape(term)}`).test(title)) score += 60
      else if (title.includes(term)) score += 35
      else if (entry.searchText.includes(term)) score += 12
      else {
        matched = false
        break
      }
    }
    if (!matched) continue
    if (entry.favorite) score += 5
    score += Math.max(0, 10 - Math.floor((Date.now() - entry.updatedAt) / (30 * 86_400_000)))
    scored.push({ entry, score })
  }
  scored.sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title))
  return scored.slice(0, limit).map((s) => s.entry)
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// The dashboard watchlist's search and groups: pure functions (tested in watchlist.test.ts).
// With 30+ ETFs the list is long, so it can be searched by code or name and is shown in groups
// ("Australian shares", "Global shares", ...) from each ETF's `category` in data/etfs.json.
// Favourites always come first, in their own group.

/** The groups, in the order the dashboard shows them (matches pipeline/datapipe/config.py CATEGORIES). */
export const CATEGORY_ORDER = ['Australian shares', 'Global shares', 'Currency-hedged', 'Diversified', 'Bonds', 'Gold', 'US-listed'] as const
/** Where an ETF without a category goes (an older etfs.json saved on the device). */
export const OTHER_CATEGORY = 'Other ETFs'

export interface WatchItem {
  id: string
  name: string
  category?: string
}

export interface WatchSection<T> {
  /** 'favourites', a category name, or 'all' (not grouped / search results). */
  key: string
  title: string
  rows: T[]
}

/** Lower case, accents and punctuation removed, so "s&p" finds "S&P" and "ishares" finds "iShares". */
function fold(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9&]+/g, ' ')
    .trim()
}

/** True when every word typed appears (anywhere) in the ETF's code, name or group, in any order. */
export function matchesSearch(item: WatchItem, query: string): boolean {
  const words = fold(query).split(' ').filter(Boolean)
  if (words.length === 0) return true
  const hay = fold(`${item.id} ${item.name} ${item.category ?? ''}`)
  return words.every((w) => hay.includes(w))
}

/** Rank search results: an exact code first, then codes starting with the text, then everything else (stable). */
function searchRank(item: WatchItem, query: string): number {
  const q = fold(query).replace(/ /g, '')
  const id = item.id.toLowerCase()
  if (id === q) return 0
  if (id.startsWith(q)) return 1
  return 2
}

export function categoryOf(item: WatchItem): string {
  return item.category && (CATEGORY_ORDER as readonly string[]).includes(item.category) ? item.category : item.category || OTHER_CATEGORY
}

/**
 * Split the (already sorted) watchlist into the sections the dashboard shows.
 * - Searching: one list of matches (favourites first, then the best code matches), no groups.
 * - Grouped: Favourites, then each category in CATEGORY_ORDER (unknown ones after), empty ones left out.
 * - Not grouped: Favourites, then everything else.
 * Rows keep their order inside each section, so the chosen sort and "my order" still apply.
 */
export function watchSections<T>(rows: T[], itemOf: (row: T) => WatchItem, opts: { favourites: string[]; grouped: boolean; query: string }): WatchSection<T>[] {
  const isFav = (r: T) => opts.favourites.includes(itemOf(r).id)
  const query = opts.query.trim()
  if (query) {
    const hits = rows.filter((r) => matchesSearch(itemOf(r), query))
    const ranked = hits
      .map((r, i) => ({ r, i, k: (isFav(r) ? 0 : 3) + searchRank(itemOf(r), query) }))
      .sort((a, b) => a.k - b.k || a.i - b.i)
      .map((x) => x.r)
    return [{ key: 'all', title: hits.length === 1 ? '1 match' : `${hits.length} matches`, rows: ranked }]
  }
  const out: WatchSection<T>[] = []
  const favs = rows.filter(isFav)
  const rest = rows.filter((r) => !isFav(r))
  if (favs.length) out.push({ key: 'favourites', title: 'Favourites', rows: favs })
  if (!opts.grouped) {
    if (rest.length) out.push({ key: 'all', title: favs.length ? 'Everything else' : 'All ETFs', rows: rest })
    return out
  }
  const byCat = new Map<string, T[]>()
  for (const r of rest) {
    const c = categoryOf(itemOf(r))
    byCat.set(c, [...(byCat.get(c) ?? []), r])
  }
  const known = CATEGORY_ORDER.filter((c) => byCat.has(c))
  const others = [...byCat.keys()].filter((c) => !(CATEGORY_ORDER as readonly string[]).includes(c)).sort()
  for (const c of [...known, ...others]) out.push({ key: c, title: c, rows: byCat.get(c)! })
  return out
}

import { describe, expect, it } from 'vitest'
import tickersRaw from '../../pipeline/tickers.json?raw'
import { moveIdNextTo } from './prefs'
import { CATEGORY_ORDER, categoryOf, matchesSearch, OTHER_CATEGORY, watchSections, type WatchItem } from './watchlist'

const items: WatchItem[] = [
  { id: 'VAS', name: 'Vanguard Australian Shares Index ETF', category: 'Australian shares' },
  { id: 'VGS', name: 'Vanguard MSCI International Shares Index ETF', category: 'Global shares' },
  { id: 'IHVV', name: 'iShares S&P 500 AUD Hedged ETF', category: 'Currency-hedged' },
  { id: 'IVV', name: 'iShares S&P 500 ETF', category: 'Global shares' },
  { id: 'GOLD', name: 'Global X Physical Gold', category: 'Gold' },
  { id: 'VOO', name: 'Vanguard S&P 500 ETF', category: 'US-listed' },
  { id: 'A200', name: 'Betashares Australia 200 ETF', category: 'Australian shares' },
  { id: 'OLD', name: 'An ETF from an older etfs.json' },
]
const idOf = (s: { rows: WatchItem[] }) => s.rows.map((r) => r.id)
const opts = (o: Partial<{ favourites: string[]; grouped: boolean; query: string }> = {}) => ({ favourites: [], grouped: true, query: '', ...o })

describe('watchlist search', () => {
  it('finds by code or by words in the name, ignoring case and word order', () => {
    expect(matchesSearch(items[0], 'vas')).toBe(true)
    expect(matchesSearch(items[0], 'shares australian')).toBe(true)
    expect(matchesSearch(items[2], 's&p hedged')).toBe(true)
    expect(matchesSearch(items[2], 'ISHARES')).toBe(true)
    expect(matchesSearch(items[0], 'gold')).toBe(false)
    expect(matchesSearch(items[0], '   ')).toBe(true)
  })

  it('also finds by group name', () => {
    expect(matchesSearch(items[2], 'currency')).toBe(true)
    expect(matchesSearch(items[4], 'gold')).toBe(true)
  })

  it('shows one list of matches: favourites first, then an exact or starting code, then the rest in the chosen order', () => {
    const [s] = watchSections(items, (r) => r, opts({ query: 'iv' }))
    expect(s.key).toBe('all')
    expect(idOf(s)).toEqual(['IVV'])
    const [all500] = watchSections(items, (r) => r, opts({ query: 's&p 500', favourites: ['VOO'] }))
    expect(idOf(all500)).toEqual(['VOO', 'IHVV', 'IVV'])
    expect(all500.title).toBe('3 matches')
    const [exact] = watchSections(items, (r) => r, opts({ query: 'gold' }))
    expect(idOf(exact)).toEqual(['GOLD'])
  })

  it('returns an empty match list when nothing matches', () => {
    const s = watchSections(items, (r) => r, opts({ query: 'zzz' }))
    expect(s).toHaveLength(1)
    expect(s[0].rows).toEqual([])
    expect(s[0].title).toBe('0 matches')
  })
})

describe('watchlist groups', () => {
  it('puts favourites first, then each group in a fixed order, keeping the sorted order inside groups', () => {
    const s = watchSections(items, (r) => r, opts({ favourites: ['GOLD', 'VGS'] }))
    expect(s.map((x) => x.title)).toEqual(['Favourites', 'Australian shares', 'Global shares', 'Currency-hedged', 'US-listed', OTHER_CATEGORY])
    expect(idOf(s[0])).toEqual(['VGS', 'GOLD']) // the list's own order, not the order they were starred
    expect(idOf(s[1])).toEqual(['VAS', 'A200'])
    expect(idOf(s[2])).toEqual(['IVV'])
    expect(s.find((x) => x.key === 'Gold')).toBeUndefined() // its only ETF is a favourite
  })

  it('without groups: favourites, then everything else', () => {
    const s = watchSections(items, (r) => r, opts({ grouped: false, favourites: ['VOO'] }))
    expect(s.map((x) => x.title)).toEqual(['Favourites', 'Everything else'])
    expect(s[1].rows).toHaveLength(items.length - 1)
    expect(watchSections(items, (r) => r, opts({ grouped: false }))[0].title).toBe('All ETFs')
  })

  it('ETFs without a category go in a group at the end', () => {
    expect(categoryOf({ id: 'X', name: 'x' })).toBe(OTHER_CATEGORY)
    expect(categoryOf({ id: 'X', name: 'x', category: 'Bonds' })).toBe('Bonds')
  })

  it('every ETF in pipeline/tickers.json has one of the groups the app knows', () => {
    const file = JSON.parse(tickersRaw) as { etfs: { id: string; category?: string }[] }
    expect(file.etfs.length).toBeGreaterThan(30)
    for (const e of file.etfs) expect(CATEGORY_ORDER, e.id).toContain(e.category)
  })
})

describe('moving an ETF within its group', () => {
  const all = ['VAS', 'VGS', 'IVV', 'IOZ', 'A200', 'GOLD']
  it('moving up puts it just above its neighbour, without shuffling the ETFs in between', () => {
    // Australian shares group shows VAS, IOZ, A200; moving IOZ up puts it just above VAS
    expect(moveIdNextTo(all, [], 'IOZ', 'VAS', 'before')).toEqual(['IOZ', 'VAS', 'VGS', 'IVV', 'A200', 'GOLD'])
    // moving VAS down (below IOZ) keeps VGS and IVV where they were
    expect(moveIdNextTo(all, [], 'VAS', 'IOZ', 'after')).toEqual(['VGS', 'IVV', 'IOZ', 'VAS', 'A200', 'GOLD'])
  })
  it('is a plain swap for rows that are next to each other', () => {
    expect(moveIdNextTo(all, [], 'VGS', 'VAS', 'before')).toEqual(['VGS', 'VAS', 'IVV', 'IOZ', 'A200', 'GOLD'])
  })
  it('ignores unknown ids', () => {
    expect(moveIdNextTo(all, ['VAS'], 'NOPE', 'VAS', 'before')).toEqual(all)
  })
})

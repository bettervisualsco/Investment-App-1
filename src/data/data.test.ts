import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import monthlyRaw from '../../data/monthly.json?raw'
import vasRaw from '../../data/daily/VAS.json?raw'
import { alignedMonths, decodeDaily, monthValue } from './decode'
import { asOfText, freshnessLabel, isStale, timeAgo, weekdaysBetween } from './freshness'
import { readDataFile, syncData } from './loader'
import { MarketDataDB } from './store'
import type { DailyFile, Meta, MonthlyFile } from './types'

const monthly = JSON.parse(monthlyRaw) as MonthlyFile
const vas = JSON.parse(vasRaw) as DailyFile

describe('decoding the compact files', () => {
  it('rebuilds daily dates from first date + gaps', () => {
    const rows = decodeDaily({ id: 'X', symbol: 'X', name: 'X', kind: 'index', currency: 'AUD', asOf: '2026-01-07', first: '2026-01-02', last: '2026-01-07', d: [0, 3, 1, 1], c: [1, 2, 3, 4] })
    expect(rows.dates).toEqual(['2026-01-02', '2026-01-05', '2026-01-06', '2026-01-07'])
    expect(rows.adj).toEqual([1, 2, 3, 4])
  })

  it('reads the real VAS file consistently', () => {
    const rows = decodeDaily(vas)
    expect(rows.dates[0]).toBe(vas.first)
    expect(rows.dates.at(-1)).toBe(vas.last)
    expect(rows.adj.length).toBe(rows.close.length)
  })

  it('lines up real months across assets, inflation and AUD/USD', () => {
    const keys = ['etf:VAS', 'us_shares', 'au_cpi', 'audusd']
    const a = alignedMonths(monthly, keys)
    expect(a.months[0] >= '1975-01').toBe(true)
    for (const k of keys) expect(a.columns[k].length).toBe(a.months.length)
    const i = a.months.indexOf('2008-10')
    expect(a.columns['us_shares'][i]).toBeCloseTo(monthValue(monthly, monthly.series.us_shares, '2008-10') as number, 10)
    // consecutive real months with no gaps from 1975 on
    expect(a.months.length).toBeGreaterThan(600)
  })

  it('respects a chosen history window', () => {
    const a = alignedMonths(monthly, ['us_shares', 'us_cpi'], '1990-01', '1999-12')
    expect(a.months[0]).toBe('1990-01')
    expect(a.months.at(-1)).toBe('1999-12')
    expect(a.months.length).toBe(120)
  })
})

describe('the real data matches well-known history', () => {
  const v = (key: keyof MonthlyFile['series'], ym: string) => monthValue(monthly, monthly.series[key], ym) as number
  const yearOver = (key: keyof MonthlyFile['series'], from: string, to: string) => {
    const a = alignedMonths(monthly, [key], from, to)
    return a.columns[key].reduce((p, x) => p * (1 + x), 1) - 1
  }

  it('shows the October 1987 crash', () => {
    expect(v('us_shares', '1987-10')).toBeLessThan(-0.15)
    expect(v('au_shares', '1987-10')).toBeLessThan(-0.3) // Australia fell about 40%
  })

  it('Australian inflation was 7.8% in the year to December 2022 (ABS)', () => {
    expect(yearOver('au_cpi', '2022-01', '2022-12')).toBeCloseTo(0.078, 2)
  })

  it('US inflation was 9.1% in the year to June 2022 (BLS)', () => {
    expect(yearOver('us_cpi', '2021-07', '2022-06')).toBeCloseTo(0.091, 2)
  })

  it('the RBA cash rate was 0.10% for most of 2021', () => {
    expect(v('cash_au', '2021-06') * 12).toBeCloseTo(0.001, 4)
  })

  it('each ETF uses its real history from realFrom, and a fee-adjusted proxy before', () => {
    for (const [id, e] of Object.entries(monthly.etfs)) {
      expect(e.realFrom, id).not.toBeNull()
      expect(e.start <= (e.realFrom as string), id).toBe(true)
      expect(e.fee, id).not.toBeNull()
      if (e.proxyCheck) expect(e.proxyCheck.correlation as number, id).toBeGreaterThan(0.9)
    }
  })
})

describe('freshness wording', () => {
  // Wednesday 21 Oct 2026, 3:00pm in Sydney (AEDT, UTC+11)
  const wed = new Date('2026-10-21T04:00:00Z')

  it('counts weekdays', () => {
    expect(weekdaysBetween('2026-10-16', '2026-10-19')).toBe(1) // Fri -> Mon
    expect(weekdaysBetween('2026-10-16', '2026-10-21')).toBe(3)
  })

  it('warns only when prices are more than 2 trading days old, on a weekday', () => {
    expect(isStale('2026-10-20', wed)).toBe(false)
    expect(isStale('2026-10-19', wed)).toBe(false)
    expect(isStale('2026-10-16', wed)).toBe(true)
    expect(isStale('2026-10-16', new Date('2026-10-18T22:00:00Z'))).toBe(false) // Monday 9am Sydney with Friday's close
    expect(isStale('2026-10-14', new Date('2026-10-17T22:00:00Z'))).toBe(false) // Sunday: never warn
    expect(isStale(undefined, wed)).toBe(true)
    expect(isStale('2026-10-21T03:40:00Z', wed)).toBe(false)
  })

  it('writes times the way the spec shows them', () => {
    expect(timeAgo('2026-10-21T03:54:00Z', wed)).toBe('6 min ago')
    expect(timeAgo('2026-10-21T01:00:00Z', wed)).toBe('3 hours ago')
    expect(asOfText('2026-10-21T03:42:00Z', wed, 'Australia/Sydney')).toBe('2:42pm')
    expect(asOfText('2026-10-16', wed)).toBe('Fri 16 Oct close')
    expect(freshnessLabel('2026-10-21T03:42:00Z', '2026-10-21T03:54:00Z', wed, 'Australia/Sydney')).toBe('Prices as of 2:42pm · updated 6 min ago')
  })
})

// ---- the loader, with a pretend website ----------------------------------------------------

function site(files: Record<string, unknown>, meta: Meta) {
  const calls: string[] = []
  let down = false
  const fetchFn = (async (input: RequestInfo | URL) => {
    const url = String(input)
    calls.push(url)
    if (down) throw new TypeError('Failed to fetch')
    const path = url.replace('https://x.test/data/', '').split('?')[0]
    if (path === 'meta.json') return new Response(JSON.stringify(meta))
    if (path in files) return new Response(typeof files[path] === 'string' ? (files[path] as string) : JSON.stringify(files[path]))
    return new Response('not found', { status: 404 })
  }) as typeof fetch
  return { fetchFn, calls, goDown: () => (down = true) }
}

function metaFor(hashes: Record<string, string>): Meta {
  const files = Object.fromEntries(Object.entries(hashes).map(([p, h]) => [p, { hash: h, bytes: 1, updatedAt: '2026-10-21T03:00:00Z', asOf: '2026-10-20' }]))
  return { schema: 1, generatedAt: '2026-10-21T03:00:00Z', files, sources: {}, tasks: {}, problems: [] }
}

let dbCount = 0
const newDb = () => new MarketDataDB(`test-${dbCount++}`)
const base = 'https://x.test/data/'

describe('syncing data to the device', () => {
  it('downloads everything the first time, then only what changed', async () => {
    const db = newDb()
    const files: Record<string, unknown> = { 'a.json': { n: 1 }, 'b.json': { n: 2 } }
    let s = site(files, metaFor({ 'a.json': 'h1', 'b.json': 'h2' }))
    const first = await syncData({ db, baseUrl: base, fetchFn: s.fetchFn })
    expect(first.status).toBe('updated')
    expect(first.changed).toEqual(['a.json', 'b.json'])

    files['b.json'] = { n: 3 }
    s = site(files, metaFor({ 'a.json': 'h1', 'b.json': 'h3' }))
    const second = await syncData({ db, baseUrl: base, fetchFn: s.fetchFn })
    expect(second.changed).toEqual(['b.json'])
    expect(s.calls.filter((c) => c.includes('/a.json'))).toEqual([])
    expect(await readDataFile(`b.json`, db)).toEqual({ n: 3 })

    const third = await syncData({ db, baseUrl: base, fetchFn: s.fetchFn })
    expect(third.status).toBe('unchanged')
  })

  it('keeps working offline with the saved copy', async () => {
    const db = newDb()
    const s = site({ 'a.json': { n: 1 } }, metaFor({ 'a.json': 'h1' }))
    await syncData({ db, baseUrl: base, fetchFn: s.fetchFn })
    s.goDown()
    const r = await syncData({ db, baseUrl: base, fetchFn: s.fetchFn })
    expect(r.status).toBe('offline')
    expect(r.meta?.files['a.json'].hash).toBe('h1')
    expect(r.checkedAt).not.toBeNull()
    expect(await readDataFile('a.json', db)).toEqual({ n: 1 })
  })

  it('never replaces a saved file with a broken download, and retries next time', async () => {
    const db = newDb()
    const files: Record<string, unknown> = { 'a.json': { n: 1 } }
    await syncData({ db, baseUrl: base, fetchFn: site(files, metaFor({ 'a.json': 'h1' })).fetchFn })
    files['a.json'] = '{"broken'
    const r = await syncData({ db, baseUrl: base, fetchFn: site(files, metaFor({ 'a.json': 'h2' })).fetchFn })
    expect(r.failed).toEqual(['a.json'])
    expect(await readDataFile('a.json', db)).toEqual({ n: 1 })
    // Labels keep describing the copy the device really has, not the newer one that failed to download.
    expect(r.meta?.files['a.json'].hash).toBe('h1')
    files['a.json'] = { n: 2 }
    const again = await syncData({ db, baseUrl: base, fetchFn: site(files, metaFor({ 'a.json': 'h2' })).fetchFn })
    expect(again.changed).toEqual(['a.json'])
    expect(again.meta?.files['a.json'].hash).toBe('h2')
  })

  it('forgets files the website no longer has', async () => {
    const db = newDb()
    await syncData({ db, baseUrl: base, fetchFn: site({ 'a.json': {}, 'b.json': {} }, metaFor({ 'a.json': 'h', 'b.json': 'h' })).fetchFn })
    await syncData({ db, baseUrl: base, fetchFn: site({ 'a.json': {} }, metaFor({ 'a.json': 'h' })).fetchFn })
    expect(await readDataFile('b.json', db)).toBeUndefined()
  })

  it('treats a broken meta.json like being offline', async () => {
    const db = newDb()
    const fetchFn = (async () => new Response('<html>oops</html>')) as typeof fetch
    const r = await syncData({ db, baseUrl: base, fetchFn })
    expect(r.status).toBe('offline')
    expect(r.meta).toBeNull()
  })
})

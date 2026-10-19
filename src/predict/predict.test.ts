import { describe, expect, it } from 'vitest'
import etfsRaw from '../../data/etfs.json?raw'
import monthlyRaw from '../../data/monthly.json?raw'
import type { EtfsFile, MonthlyFile } from '../data'
import { etfKey, CASH_KEY } from '../engine/assets'
import { preparePrediction, runPrediction } from '../engine/prediction'
import type { Investment, Phase, Plan } from '../engine/types'
import { factsFor, withInvestment } from './etfFacts'
import { audToUsd, buildHistory, grossOfFee, usdToAud } from './history'
import { BUILT_IN_DEFAULTS, cleanDefaults, resolvePrediction } from './settingsStore'

const monthly = JSON.parse(monthlyRaw) as MonthlyFile
const etfs = JSON.parse(etfsRaw) as EtfsFile

function phase(investment?: Investment, p: Partial<Phase> = {}): Phase {
  return {
    id: 'p1',
    name: 'Phase',
    duration: { count: 10, unit: 'years' },
    depositFrequency: 'monthly',
    deposit: { kind: 'fixed', value: 50_000 },
    returnRate: { kind: 'fixed', value: 7 },
    investment,
    ...p,
  }
}
const plan = (phases: Phase[], p: Partial<Plan> = {}): Plan => ({ id: 'x', name: 'x', startDate: '2026-11-01', startingBalance: 0, currency: 'AUD', phases, events: [], ...p })

/** A tiny monthly file: a US$ ETF and an A$ ETF, with AUD/USD, CPI and cash, for 2000-01 to 2004-12. */
function fakeFile(): MonthlyFile {
  const n = 60
  const series = (start: string, values: (number | null)[], kind: 'return' | 'inflation' | 'fx' = 'return', currency: 'AUD' | 'USD' = 'AUD') => ({ label: 'x', kind, currency, start, values, segments: [] })
  const etf = (currency: 'AUD' | 'USD', fee: number, values: number[]) => ({ label: 'x', currency, start: '2000-01', realFrom: null, fee, proxy: [], proxyCheck: null, values })
  return {
    schema: 1,
    asOf: '2004-12',
    scale: 100000,
    allSeriesFrom: '2000-01',
    allSeriesTo: '2004-12',
    note: '',
    series: {
      au_cpi: series('2000-01', new Array(n).fill(200), 'inflation'),
      us_cpi: series('1999-01', new Array(n + 12).fill(300), 'inflation', 'USD'),
      audusd: series('2000-01', Array.from({ length: n }, (_, i) => (i % 2 ? -2000 : 5000)), 'fx', 'USD'),
      cash_au: { ...series('2001-01', new Array(48).fill(400)), label: 'Australian cash rate' },
      cash_us: series('2000-01', new Array(n).fill(100), 'return', 'USD'),
    } as unknown as MonthlyFile['series'],
    etfs: {
      US1: etf('USD', 0.0012, new Array(n).fill(10000)),
      AU1: etf('AUD', 0.0024, new Array(n).fill(-3000)),
    },
  }
}

describe('turning monthly.json into the history Prediction mode replays', () => {
  it('converts US-listed ETFs to A$ with the same month’s AUD/USD move', () => {
    // +10% in US$ while the A$ rises 5% against the US$: in A$ that's 1.10 / 1.05 − 1.
    expect(usdToAud(0.1, 0.05)).toBeCloseTo(1.1 / 1.05 - 1, 14)
    expect(audToUsd(usdToAud(0.1, 0.05), 0.05)).toBeCloseTo(0.1, 14)
    const b = buildHistory(fakeFile(), plan([phase({ kind: 'etf', etf: 'US1' })]), { window: 'full' })
    if (!b.ok) throw new Error(b.message)
    const col = b.table.assets[etfKey('US1')]
    // Month 0: fx +5%; month 1: fx −2%. The fee (0.12% a year) is added back first.
    expect(col[0]).toBeCloseTo((1 + grossOfFee(0.1, 0.0012)) / 1.05 - 1, 14)
    expect(col[1]).toBeCloseTo((1 + grossOfFee(0.1, 0.0012)) / 0.98 - 1, 14)
  })

  it('adds the ETF’s fee back, so the Fees switch doesn’t take it off twice', () => {
    expect(grossOfFee(0.01, 0.0012)).toBeCloseTo(1.01 / (1 - 0.0001) - 1, 15)
    // A month after fees of r, then the engine's monthly MER (fee/12) taken off, gives back r exactly.
    const r = 0.0137
    expect((1 + grossOfFee(r, 0.0018)) * (1 - 0.0018 / 12) - 1).toBeCloseTo(r, 15)
    const b = buildHistory(fakeFile(), plan([phase({ kind: 'etf', etf: 'AU1' })]), { window: 'full' })
    if (!b.ok) throw new Error(b.message)
    expect(b.table.assets[etfKey('AU1')][0]).toBeCloseTo(grossOfFee(-0.03, 0.0024), 14)
    // An A$ ETF in an A$ plan isn't touched by the exchange rate.
    expect(b.table.months[0]).toBe('2000-01')
    expect(b.table.inflation[0]).toBeCloseTo(0.002, 14)
  })

  it('turns A$ ETFs into US$ for a US$ plan, and uses US inflation and cash', () => {
    const b = buildHistory(fakeFile(), plan([phase({ kind: 'etf', etf: 'AU1' }), phase({ kind: 'cash', rate: 1 }, { id: 'p2' })], { currency: 'USD' }), { window: 'full' })
    if (!b.ok) throw new Error(b.message)
    expect(b.table.assets[etfKey('AU1')][0]).toBeCloseTo((1 + grossOfFee(-0.03, 0.0024)) * 1.05 - 1, 14)
    expect(b.table.inflation[0]).toBeCloseTo(0.003, 14)
    expect(b.table.assets[CASH_KEY][0]).toBeCloseTo(0.001, 14)
  })

  it('only uses months where every needed series has data, and says so', () => {
    // cash_au only starts in 2001.
    const b = buildHistory(fakeFile(), plan([phase({ kind: 'cash', rate: 3 })]), { window: 'full' })
    if (!b.ok) throw new Error(b.message)
    expect(b.info.first).toBe('2001-01')
    expect(b.info.last).toBe('2004-12')
    expect(b.info.months).toBe(48)
    expect(b.info.note).toMatch(/starts in Jan 2001 because .*cash/i)
  })
})

describe('history windows with the real data', () => {
  const vas = plan([phase({ kind: 'etf', etf: 'VAS' })])

  it('full history for VAS starts in 1975 (where Australian share data begins)', () => {
    const b = buildHistory(monthly, vas, { window: 'full' })
    if (!b.ok) throw new Error(b.message)
    expect(b.info.first).toBe('1975-01')
    expect(b.info.last).toBe(monthly.allSeriesTo)
    expect(b.info.clipped).toBe(false)
    expect(b.info.note).toMatch(/Full history: Jan 1975 to .* It starts in Jan 1975 because .*VAS \(with Australian shares history/)
  })

  it('"since 1950" is clipped to 1975 for VAS, and says so', () => {
    const b = buildHistory(monthly, vas, { window: 'since1950' })
    if (!b.ok) throw new Error(b.message)
    expect(b.info.first).toBe('1975-01')
    expect(b.info.clipped).toBe(true)
    expect(b.info.note).toMatch(/^History since 1950: Jan 1975/)
  })

  it('"since 1990" and "last 20 years" are not clipped', () => {
    const a = buildHistory(monthly, vas, { window: 'since1990' })
    const b = buildHistory(monthly, vas, { window: 'last20' })
    if (!a.ok || !b.ok) throw new Error('expected ok')
    expect(a.info.first).toBe('1990-01')
    expect(a.info.clipped).toBe(false)
    expect(b.info.months).toBe(240)
    expect(b.info.last).toBe(monthly.allSeriesTo)
  })

  it('a US-listed ETF in an A$ plan needs AUD/USD (from 1969); in a US$ plan it goes back to 1871', () => {
    const voo = (currency: 'AUD' | 'USD') => plan([phase({ kind: 'etf', etf: 'VOO' })], { currency })
    const aud = buildHistory(monthly, voo('AUD'), { window: 'full' })
    const usd = buildHistory(monthly, voo('USD'), { window: 'full' })
    if (!aud.ok || !usd.ok) throw new Error('expected ok')
    expect(aud.info.first).toBe('1969-08')
    expect(aud.info.note).toMatch(/AUD\/USD/)
    expect(usd.info.first).toBe('1871-02')
  })

  it('a custom window outside the data is refused with a plain message; one partly outside is clipped', () => {
    const none = buildHistory(monthly, vas, { window: 'custom', from: 1960, to: 1970 })
    expect(none.ok).toBe(false)
    if (!none.ok) expect(none.message).toMatch(/runs from Jan 1975/)
    const part = buildHistory(monthly, vas, { window: 'custom', from: 1970, to: 2100 })
    if (!part.ok) throw new Error(part.message)
    expect(part.info.first).toBe('1975-01')
    expect(part.info.clipped).toBe(true)
    expect(part.info.note).toMatch(/It ends in/)
  })

  it('holdings kept separately are part of the history, cut to where their data starts, and the note says so', () => {
    // VAS alone goes back to 1975. A VOO holding kept separately needs AUD/USD (from Aug 1969), so nothing changes
    // there; a cash holding needs the cash rate, which starts later than VAS.
    const holding = (investment: Investment) => plan([phase({ kind: 'etf', etf: 'VAS' })], { startingBalance: 1_000_000, startingMoney: { entry: 'single', single: { investment } } })
    const voo = buildHistory(monthly, holding({ kind: 'etf', etf: 'VOO' }), { window: 'full' })
    if (!voo.ok) throw new Error(voo.message)
    expect(Object.keys(voo.table.assets).sort()).toEqual([etfKey('VAS'), etfKey('VOO')])
    expect(voo.info.note).toMatch(/It includes the history for what you have now \(VOO\), and every investment uses the same months\./)
    const cash = buildHistory(monthly, holding({ kind: 'cash', rate: 4 }), { window: 'full' })
    if (!cash.ok) throw new Error(cash.message)
    expect(Object.keys(cash.table.assets).sort()).toEqual([CASH_KEY, etfKey('VAS')])
    const cashStart = monthly.series.cash_au.start
    expect(cash.info.first >= cashStart && cash.info.first >= '1975-01').toBe(true)
    expect(cash.info.note).toMatch(/the cash rate/)
    // "Move them into my plan's investments": sold on day one, so their history isn't needed.
    const moved = holding({ kind: 'etf', etf: 'VOO' })
    moved.startingMoney!.handling = 'move'
    const m = buildHistory(monthly, moved, { window: 'full' })
    if (!m.ok) throw new Error(m.message)
    expect(Object.keys(m.table.assets)).toEqual([etfKey('VAS')])
    expect(m.info.note).not.toMatch(/what you have now/)
    // End to end: the kept holding is replayed alongside the phase.
    const r = runPrediction(preparePrediction(holding({ kind: 'etf', etf: 'VOO' }), voo.table, { runs: 200, blockMonths: 12, seed: 1, percentiles: [10, 50, 90] }))
    expect(r.final.mid).toBeGreaterThan(1_000_000)
  })

  it('a mix needs every part’s history', () => {
    const mix = plan([phase({ kind: 'mix', parts: [{ etf: 'VGS', weight: 70 }, { etf: 'VAS', weight: 30 }] })])
    const b = buildHistory(monthly, mix, { window: 'full' })
    if (!b.ok) throw new Error(b.message)
    expect(b.info.first).toBe('1975-01') // VGS alone goes back to 1969, VAS to 1975
  })

  it('an ETF that isn’t in the data is a plain message', () => {
    const b = buildHistory(monthly, plan([phase({ kind: 'etf', etf: 'NOPE' })]), { window: 'full' })
    expect(b.ok).toBe(false)
  })

  it('a lump sum’s middle result grows at about history’s own average rate (with Fees on, after the fee)', () => {
    const lump = plan([phase({ kind: 'etf', etf: 'VAS' }, { duration: { count: 30, unit: 'years' }, depositFrequency: 'none', mer: 0.07 })], {
      startDate: '2027-01-01',
      startingBalance: 1_000_000,
      realism: { fees: true, tax: false, inflation: false, feeSettings: { brokerage: { kind: 'flat', fee: 0 }, buyFrequency: 'eachDeposit', cashRate: 0, fxFeePct: 0, platformFee: 0, platformFeePer: 'month', spreadPct: 0 } },
    })
    const b = buildHistory(monthly, lump, { window: 'full' })
    if (!b.ok) throw new Error(b.message)
    // History's own typical growth, after VAS's fee: the average monthly log return of the data as published.
    const net = monthly.etfs.VAS.values.filter((v): v is number => v !== null).map((v) => Math.log1p(v / monthly.scale))
    const yearly = Math.exp((12 * net.reduce((s, x) => s + x, 0)) / net.length)
    const r = runPrediction(preparePrediction(lump, b.table, { runs: 2000, blockMonths: 12, seed: 1, percentiles: [10, 50, 90] }))
    const middleYearly = Math.pow(r.final.mid / 1_000_000, 1 / 30)
    expect(Math.abs(middleYearly - yearly)).toBeLessThan(0.006)
  })

  it('runs end to end on the real data with sensible numbers', () => {
    // $500 a month into VAS for 10 years: the middle result should be well above what was put in.
    const b = buildHistory(monthly, vas, { window: 'full' })
    if (!b.ok) throw new Error(b.message)
    const r = runPrediction(preparePrediction(vas, b.table, { runs: 1000, blockMonths: 12, seed: 1, percentiles: [10, 50, 90] }))
    const putIn = 120 * 50_000
    expect(r.final.mid).toBeGreaterThan(putIn * 1.2)
    expect(r.final.low).toBeLessThan(r.final.mid)
    expect(r.final.high).toBeGreaterThan(r.final.mid)
    expect(r.belowPutIn.share).toBeGreaterThan(0)
    expect(r.belowPutIn.share).toBeLessThan(0.2)
  })
})

describe('ETF facts', () => {
  it('fill in a phase’s fee, yield and franking from etfs.json', () => {
    const p = withInvestment(phase(), { kind: 'etf', etf: 'VAS' }, etfs, 'AUD')
    const vas = etfs.etfs.find((e) => e.id === 'VAS')!
    expect(p.mer).toBe(vas.mer!.value)
    expect(p.distribution?.yield).toBe(vas.yield!.value)
    expect(p.distribution?.frankedPct).toBe(vas.franking!.value)
    expect(p.usListed).toBe(false)
    const voo = withInvestment(phase(), { kind: 'etf', etf: 'VOO' }, etfs, 'AUD')
    expect(voo.usListed).toBe(true)
    expect(voo.distribution?.foreignPct).toBe(100)
  })

  it('weight a mix by each part’s share (franking by its share of the income)', () => {
    const f = factsFor({ kind: 'mix', parts: [{ etf: 'VGS', weight: 70 }, { etf: 'VAS', weight: 30 }] }, etfs, 'AUD')!
    const vgs = etfs.etfs.find((e) => e.id === 'VGS')!
    const vas = etfs.etfs.find((e) => e.id === 'VAS')!
    expect(f.mer).toBeCloseTo(0.7 * vgs.mer!.value + 0.3 * vas.mer!.value, 3)
    const y = 0.7 * vgs.yield!.value + 0.3 * vas.yield!.value
    expect(f.yield).toBeCloseTo(y, 2)
    expect(f.frankedPct).toBeCloseTo((0.3 * vas.yield!.value * vas.franking!.value!) / y, 1)
  })
})

describe('prediction defaults', () => {
  it('fall back to the built-in defaults for anything invalid', () => {
    expect(cleanDefaults(null)).toEqual(BUILT_IN_DEFAULTS)
    expect(cleanDefaults({ runs: 100, percentiles: [90, 50, 10], seed: -1 })).toEqual(BUILT_IN_DEFAULTS)
    expect(cleanDefaults({ runs: 5000, percentiles: [5, 50, 95], seed: 42 })).toEqual({ runs: 5000, percentiles: [5, 50, 95], seed: 42 })
  })

  it('a plan’s own settings win over the defaults', () => {
    const r = resolvePrediction({ mode: 'prediction', runs: 800 }, BUILT_IN_DEFAULTS)
    expect(r.runs).toBe(800)
    expect(r.percentiles).toEqual([10, 50, 90])
    expect(r.window).toBe('full')
    expect(r.blockMonths).toBe(12)
    expect(resolvePrediction(undefined, BUILT_IN_DEFAULTS).mode).toBe('manual')
  })
})

describe('Australian cash rate (audit fix)', () => {
  it('a 4.35% yearly RBA rate compounds to exactly 4.35% over 12 months, like a typed savings rate', async () => {
    const { auCashMonthly } = await import('./history')
    const m = auCashMonthly(0.0435 / 12)
    expect(Math.pow(1 + m, 12) - 1).toBeCloseTo(0.0435, 12)
    expect(auCashMonthly(0)).toBe(0)
  })
})

describe('foreign income share of ASX-listed ETFs (audit fix)', () => {
  it('comes from what the fund holds, not where it is listed', async () => {
    const { foreignShareOf, factsFor } = await import('./etfFacts')
    const etfs = JSON.parse(etfsRaw) as EtfsFile
    const info = (id: string) => etfs.etfs.find((e) => e.id === id)!
    expect(foreignShareOf(info('VGS'))).toBe(100)
    expect(foreignShareOf(info('IVV'))).toBe(100)
    expect(foreignShareOf(info('NDQ'))).toBe(100)
    expect(foreignShareOf(info('VAS'))).toBe(0)
    expect(foreignShareOf(info('VAF'))).toBe(0)
    expect(foreignShareOf(info('VDHG'))).toBeCloseTo(61, 0) // 38 + 16 + 7 of 100
    expect(factsFor({ kind: 'etf', etf: 'VGS' }, etfs, 'AUD')!.foreignPct).toBe(100)
    expect(factsFor({ kind: 'etf', etf: 'VDHG' }, etfs, 'AUD')!.gaps.join(' ')).toMatch(/foreign income share/)
  })
})

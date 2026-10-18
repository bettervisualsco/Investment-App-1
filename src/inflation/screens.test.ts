import { describe, expect, it } from 'vitest'
import inflationRaw from '../../data/inflation.json?raw'
import monthlyRaw from '../../data/monthly.json?raw'
import { monthNumber } from '../data/decode'
import type { InflationFile, MonthlyFile } from '../data/types'
import { monthlyChain, realReturn, yearLevels, type YearLevels } from './cpi'
import { etfRealReturns } from './etfReal'
import { growthBetween } from './predict'
import { getPrediction } from './predictionCache'
import { powerAnswer } from './power'
import { DEFAULT_WINDOW } from './window'

const file = JSON.parse(inflationRaw) as InflationFile
const monthly = JSON.parse(monthlyRaw) as MonthlyFile
const chains = { au: monthlyChain(file, 'au'), us: monthlyChain(file, 'us') }

describe('buying power calculator', () => {
  // a made-up country: prices 100 in 2000, 150 in 2010, latest 160 (Jun 2012)
  const y: YearLevels = { years: new Map([[2000, 100], [2010, 150]]), first: 2000, lastFull: 2010, latest: { m: 2012 * 12 + 5, level: 160, label: 'Jun 2012' } }
  const flat = (from: number, to: number) => {
    const g = Math.pow(1.03, to - from)
    return { low: g * 0.9, mid: g, high: g * 1.1 }
  }

  it('past years, both ways: $100 in 2000 = $150 in 2010, and $150 in 2010 = $100 in 2000', () => {
    const fwd = powerAnswer(100, '2000', '2010', y, null)!
    expect(fwd.kind).toBe('exact')
    expect(fwd.value).toBeCloseTo(150, 12)
    expect(fwd.rise).toBeCloseTo(0.5, 12)
    expect(fwd.yearly).toBeCloseTo(Math.pow(1.5, 0.1) - 1, 12)
    const back = powerAnswer(150, '2010', '2000', y, null)!
    expect(back.value).toBeCloseTo(100, 12)
    expect(back.rise).toBeCloseTo(0.5, 12) // prices still rose 50% between the two dates
  })

  it('now uses the latest figure', () => {
    expect(powerAnswer(100, '2000', 'now', y, null)!.value).toBeCloseTo(160, 12)
  })

  it('future years use the prediction: likely value plus a range, and going back in time swaps worst and best', () => {
    const fwd = powerAnswer(100, 'now', '2022', y, flat)!
    expect(fwd.kind).toBe('estimate')
    expect(fwd.value).toBeCloseTo(100 * Math.pow(1.03, 10), 10)
    expect(fwd.low).toBeLessThan(fwd.value)
    expect(fwd.high).toBeGreaterThan(fwd.value)
    const back = powerAnswer(fwd.value, '2022', 'now', y, flat)!
    expect(back.value).toBeCloseTo(100, 10)
    expect(back.low!).toBeLessThan(back.high!)
    // from a past year into the future: exact part, then the estimate
    expect(powerAnswer(100, '2000', '2013', y, flat)!.value).toBeCloseTo(160 * 1.03, 10)
    // without a prediction there's no answer for the future
    expect(powerAnswer(100, 'now', '2022', y, null)).toBeNull()
  })

  it('with the real prediction, $100 now needs more later, and the range is ordered', () => {
    const au = yearLevels(file, 'au')
    const pred = getPrediction(chains.au, DEFAULT_WINDOW)
    const a = powerAnswer(10000, 'now', String(Math.floor(au.latest.m / 12) + 10), au, (f, t) => growthBetween(pred, f, t))!
    expect(a.low!).toBeLessThan(a.value)
    expect(a.value).toBeLessThan(a.high!)
    expect(a.value).toBeGreaterThan(11000)
    expect(a.value).toBeLessThan(15000)
    // the same simulated futures every time
    expect(getPrediction(chains.au, DEFAULT_WINDOW)).toBe(pred)
  })
})

describe('ETF returns after inflation (real data)', () => {
  it('every ETF ends in the same month, and 10 years is 120 months', () => {
    const rows = etfRealReturns(monthly, chains, '10', true)
    expect(rows.length).toBe(Object.keys(monthly.etfs).length)
    const ends = new Set(rows.map((r) => r.to))
    expect(ends.size).toBe(1)
    for (const r of rows) expect(r.result?.months).toBe(120)
  })

  it('matches working it out by hand for VAS over 5 years', () => {
    const row = etfRealReturns(monthly, chains, '5', true).find((r) => r.id === 'VAS')!
    const end = monthNumber('2026-08')
    expect(row.to).toBe('Aug 2026')
    const e = monthly.etfs.VAS
    const r: number[] = []
    const i: number[] = []
    for (let m = end - 59; m <= end; m++) {
      r.push((e.values[m - monthNumber(e.start)] as number) / monthly.scale)
      i.push(chains.au.changes[m - chains.au.start])
    }
    const expected = realReturn(r, i)
    expect(row.result!.real).toBeCloseTo(expected.real, 12)
    expect(row.result!.real).toBeLessThan(row.result!.nominal) // inflation was positive
    expect(row.usesProxy).toBe(false) // VAS's own history covers it
  })

  it('US ETFs: in US$ after US inflation, or in A$ after Australian inflation', () => {
    const usd = etfRealReturns(monthly, chains, '10', false).find((r) => r.id === 'VOO')!
    const aud = etfRealReturns(monthly, chains, '10', true).find((r) => r.id === 'VOO')!
    expect(usd.view).toBe('us')
    expect(aud.view).toBe('au')
    expect(usd.result!.nominal).not.toBeCloseTo(aud.result!.nominal, 4)
  })

  it('marks periods that reach back before the ETF existed', () => {
    const dhhf = etfRealReturns(monthly, chains, '20', true).find((r) => r.id === 'DHHF')!
    expect(dhhf.usesProxy).toBe(true) // DHHF started in 2019
    const own = etfRealReturns(monthly, chains, 'own', true).find((r) => r.id === 'DHHF')!
    expect(own.usesProxy).toBe(false)
    expect(own.from).toBe('Jan 2020')
  })
})

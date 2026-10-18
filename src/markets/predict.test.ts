import { describe, expect, it } from 'vitest'
import monthlyRaw from '../../data/monthly.json?raw'
import type { MonthlyFile, MonthlySeries } from '../data/types'
import { historyReturns, predictLines, predictionSeed, yearlyFromMultiplier } from './predict'

const real = JSON.parse(monthlyRaw) as MonthlyFile

/** A tiny monthly file: one ETF with the same return every month, and AUD/USD. */
function fake(etfMonthly: number, audusdMonthly: number, currency: 'AUD' | 'USD' = 'USD'): MonthlyFile {
  const scale = 100000
  const n = 240
  const series = (v: number): MonthlySeries => ({ label: '', kind: 'return', currency: 'USD', start: '2000-01', values: Array(n).fill(Math.round(v * scale)), segments: [] })
  return {
    schema: 1,
    asOf: '2019-12',
    scale,
    allSeriesFrom: '2000-01',
    allSeriesTo: '2019-12',
    note: '',
    series: { audusd: { ...series(audusdMonthly), kind: 'fx' } } as MonthlyFile['series'],
    etfs: {
      X: { label: 'X', currency, start: '2000-01', realFrom: '2010-01', fee: 0, proxy: [], proxyCheck: null, values: series(etfMonthly).values },
    },
  }
}

describe('prediction lines', () => {
  it('a steady 1% a month gives exactly 1.01^k on every line', () => {
    const p = predictLines({ monthly: fake(0.01, 0), etfId: 'X', years: 5, runs: 200 })
    expect(p.months).toBe(60)
    expect(p.likely.length).toBe(61)
    expect(p.likely[0]).toBe(1)
    for (const k of [1, 12, 60]) {
      expect(p.worst[k]).toBeCloseTo(1.01 ** k, 10)
      expect(p.likely[k]).toBeCloseTo(1.01 ** k, 10)
      expect(p.best[k]).toBeCloseTo(1.01 ** k, 10)
    }
    expect(yearlyFromMultiplier(p.likely[60], 60)).toBeCloseTo(1.01 ** 12 - 1, 10)
  })

  it('shows a US$ ETF in A$ with the same month’s AUD/USD move', () => {
    // ETF flat in US$, Australian dollar up 1% a month → A$ value falls to 1/1.01 each month
    const h = historyReturns(fake(0, 0.01), 'X', true)
    expect(h.returns[0]).toBeCloseTo(1 / 1.01 - 1, 5)
    // an A$ ETF is never converted
    expect(historyReturns(fake(0, 0.01, 'AUD'), 'X', true).returns[0]).toBe(0)
  })

  it('price only takes the distribution yield off each month', () => {
    // 2% a month total return, 12% a year yield → 1% a month paid out
    const h = historyReturns(fake(0.02, 0), 'X', false, 12)
    expect(h.returns[0]).toBeCloseTo(1.02 / 1.01 - 1, 5)
  })

  it('gives exactly the same lines every time (fixed seed)', () => {
    const a = predictLines({ monthly: real, etfId: 'VAS', years: 10 })
    const b = predictLines({ monthly: real, etfId: 'VAS', years: 10 })
    expect(Array.from(a.likely)).toEqual(Array.from(b.likely))
    expect(Array.from(a.worst)).toEqual(Array.from(b.worst))
    expect(Array.from(a.best)).toEqual(Array.from(b.best))
    expect(a.seed).toBe(predictionSeed('VAS', false, false))
    // a different seed gives different (but similar) lines
    const c = predictLines({ monthly: real, etfId: 'VAS', years: 10, seed: 12345 })
    expect(Array.from(c.likely)).not.toEqual(Array.from(a.likely))
  })

  it('looks sensible on real data: worst < likely < best, likely within normal share returns', () => {
    for (const id of ['VAS', 'VGS', 'VOO', 'VAF']) {
      const p = predictLines({ monthly: real, etfId: id, years: 20 })
      expect(p.worst[240]).toBeLessThan(p.likely[240])
      expect(p.likely[240]).toBeLessThan(p.best[240])
      const likelyYearly = yearlyFromMultiplier(p.likely[240], 240)
      expect(likelyYearly).toBeGreaterThan(0.02)
      expect(likelyYearly).toBeLessThan(0.13)
    }
  })

  it('uses all the long-run history (VOO back to 1871; in A$ only from when AUD/USD starts in 1969)', () => {
    const own = predictLines({ monthly: real, etfId: 'VOO', years: 1 })
    expect(own.historyFrom).toBe('1871-02')
    const aud = predictLines({ monthly: real, etfId: 'VOO', years: 1, inAud: true })
    expect(aud.historyFrom.slice(0, 4)).toBe('1969')
  })
})

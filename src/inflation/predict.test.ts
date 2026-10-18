import { describe, expect, it } from 'vitest'
import inflationRaw from '../../data/inflation.json?raw'
import type { InflationFile } from '../data/types'
import { chainEnd, chainSlice, monthlyChain } from './cpi'
import { growthBetween, predictInflation } from './predict'
import { DEFAULT_WINDOW, windowMonths } from './window'

const file = JSON.parse(inflationRaw) as InflationFile

function realInput(country: 'au' | 'us') {
  const chain = monthlyChain(file, country)
  const { from, to } = windowMonths(DEFAULT_WINDOW, chain)
  const end = chainEnd(chain)
  return { history: chainSlice(chain, from, to), recent: chainSlice(chain, end - 11, end), seedKey: `${country}|rba` }
}

describe('inflation predictions', () => {
  it('hand-worked: if every month in history was +0.2%, every future is exactly that', () => {
    const p = predictInflation({ history: Array(60).fill(0.002), recent: Array(12).fill(0.002), seedKey: 'flat', runs: 50, chartYears: 5, years: 10 })
    const yearly = Math.pow(1.002, 12) - 1
    for (const band of [p.yearly, p.average])
      for (const arr of [band.low, band.mid, band.high]) for (let k = 1; k < arr.length; k++) expect(arr[k]).toBeCloseTo(yearly, 12)
    expect(growthBetween(p, 0, 10).mid).toBeCloseTo(Math.pow(1.002, 120), 10)
    expect(growthBetween(p, 3, 10).low).toBeCloseTo(Math.pow(1.002, 84), 10)
  })

  it('starts from the latest real yearly figure, and the first year mixes real months with simulated ones', () => {
    // recent year: 1% a month; history: 0% a month
    const p = predictInflation({ history: Array(60).fill(0), recent: Array(12).fill(0.01), seedKey: 'join', runs: 20, chartYears: 2, years: 2 })
    expect(p.yearly.mid[0]).toBeCloseTo(Math.pow(1.01, 12) - 1, 12)
    expect(p.yearly.mid[6]).toBeCloseTo(Math.pow(1.01, 6) - 1, 12) // 6 real months left in the window
    expect(p.yearly.mid[12]).toBeCloseTo(0, 12)
  })

  it('is repeatable: same data and choices give exactly the same answer', () => {
    const a = predictInflation({ ...realInput('au'), runs: 500 })
    const b = predictInflation({ ...realInput('au'), runs: 500 })
    expect(Array.from(a.yearly.mid)).toEqual(Array.from(b.yearly.mid))
    expect(Array.from(a.average.high)).toEqual(Array.from(b.average.high))
    expect(Array.from(a.growthByYear)).toEqual(Array.from(b.growthByYear))
    const c = predictInflation({ ...realInput('au'), seedKey: 'something else', runs: 500 })
    expect(Array.from(c.average.high)).not.toEqual(Array.from(a.average.high))
  })

  it('real data, since 1993: worst ≥ likely ≥ best, and the likely 10-year average is near the RBA target', () => {
    for (const country of ['au', 'us'] as const) {
      const p = predictInflation(realInput(country))
      for (let k = 0; k <= p.chartMonths; k++) {
        expect(p.yearly.low[k]).toBeLessThanOrEqual(p.yearly.mid[k] + 1e-12)
        expect(p.yearly.mid[k]).toBeLessThanOrEqual(p.yearly.high[k] + 1e-12)
      }
      const tenYears = p.average.mid[120]
      expect(tenYears).toBeGreaterThan(0.015)
      expect(tenYears).toBeLessThan(0.035)
      // the range narrows over longer periods: a single year can be wild, a 30-year average less so
      expect(p.average.high[360] - p.average.low[360]).toBeLessThan(p.yearly.high[360] - p.yearly.low[360])
    }
  })

  it('point 0 is Australia’s latest yearly figure (3.97% to Aug 2026)', () => {
    const p = predictInflation({ ...realInput('au'), runs: 100 })
    expect(p.yearly.mid[0] * 100).toBeCloseTo(3.97, 2)
  })

  it('needs at least a year of history', () => {
    expect(() => predictInflation({ history: [0.01], recent: [], seedKey: 'x' })).toThrow()
  })
})

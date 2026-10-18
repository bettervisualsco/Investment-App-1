import { describe, expect, it } from 'vitest'
import inflationRaw from '../../data/inflation.json?raw'
import monthlyRaw from '../../data/monthly.json?raw'
import { monthNumber, monthValue } from '../data/decode'
import type { InflationFile, MonthlyFile } from '../data/types'
import {
  chainAverage,
  chainEnd,
  compoundYearly,
  historyLevels,
  monthlyChain,
  purchasingPower,
  quarterlyLevels,
  realReturn,
  toAudReturn,
  windowChange,
  yearLevels,
  yearlyInflation,
  type Levels,
} from './cpi'
import { DEFAULT_WINDOW, historicalAverage, windowMonths } from './window'

const file = JSON.parse(inflationRaw) as InflationFile
const monthly = JSON.parse(monthlyRaw) as MonthlyFile

const yearlyAt = (levels: Levels, label: string) => yearlyInflation(levels).find((p) => p.label === label)?.pct

describe('compound average inflation (hand-worked)', () => {
  it('100 → 121 over 2 years is exactly 10% a year', () => {
    expect(compoundYearly(100, 121, 24)).toBeCloseTo(0.1, 12)
  })

  it('100 → 150 over 10 years is 4.138% a year, not 5% (the simple average)', () => {
    // 1.5 ^ (1/10) = 1.041380…
    expect(compoundYearly(100, 150, 120)).toBeCloseTo(0.0413797, 6)
  })

  it('+10% then −10% averages −0.50% a year, not 0%', () => {
    // 100 → 110 → 99: sqrt(0.99) − 1 = −0.5013%
    expect(compoundYearly(100, 99, 24)).toBeCloseTo(-0.0050126, 6)
  })

  it('a highlighted window uses the levels at its two ends, in either drag direction', () => {
    const levels: Levels = {
      freq: 'quarterly',
      points: [
        { m: 2000 * 12 + 2, level: 100, label: 'Mar qtr 2000' },
        { m: 2000 * 12 + 5, level: 101, label: 'Jun qtr 2000' },
        { m: 2001 * 12 + 2, level: 104, label: 'Mar qtr 2001' },
        { m: 2002 * 12 + 2, level: 108.16, label: 'Mar qtr 2002' },
      ],
    }
    const w = windowChange(levels, 0, 3)!
    expect(w.months).toBe(24)
    expect(w.total).toBeCloseTo(0.0816, 12)
    expect(w.yearly).toBeCloseTo(0.04, 12) // 1.04 × 1.04 = 1.0816
    expect(windowChange(levels, 3, 0)).toEqual(w)
    expect(windowChange(levels, 2, 2)).toBeNull()
  })
})

describe('yearly inflation against published figures', () => {
  const auQ = historyLevels(file, 'au_q')
  const auM = historyLevels(file, 'au_m')
  const usM = historyLevels(file, 'us_m')

  // The ABS quoted these from its old index, rounded to 1 decimal place (e.g. 130.8 / 121.3 = 7.83%).
  // Today's index has 2 decimal places on a new base, so our figures can differ by a few hundredths.
  it('Australia: 7.8% in the year to the Dec quarter 2022, the 2022 peak (ABS)', () => {
    expect(yearlyAt(auQ, 'Dec qtr 2022')).toBeCloseTo(7.8, 0)
    expect(Math.abs(yearlyAt(auQ, 'Dec qtr 2022')! - 7.8)).toBeLessThan(0.1)
  })

  it('Australia: 6.1% (Jun qtr 2022) and 7.3% (Sep qtr 2022) on the way up (ABS)', () => {
    expect(Math.abs(yearlyAt(auQ, 'Jun qtr 2022')! - 6.1)).toBeLessThan(0.15)
    expect(Math.abs(yearlyAt(auQ, 'Sep qtr 2022')! - 7.3)).toBeLessThan(0.1)
  })

  it('Australia: Dec qtr 2022 was the highest since the Mar qtr 1990 (ABS: "highest since 1990")', () => {
    const peak = yearlyAt(auQ, 'Dec qtr 2022')!
    const between = yearlyInflation(auQ).filter((p) => p.m > 1990 * 12 + 2 && p.m < 2022 * 12 + 11)
    expect(Math.max(...between.map((p) => p.pct))).toBeLessThan(peak)
    expect(yearlyAt(auQ, 'Mar qtr 1990')).toBeGreaterThan(peak)
  })

  it('Australia monthly CPI: 3.6% to Sep 2025 and 3.8% to Oct 2025, the first complete Monthly CPI release (ABS)', () => {
    expect(yearlyAt(auM, 'Sep 2025')!.toFixed(1)).toBe('3.6')
    expect(yearlyAt(auM, 'Oct 2025')!.toFixed(1)).toBe('3.8')
    // the monthly series starts Apr 2024, so its first yearly figure is Apr 2025
    expect(yearlyInflation(auM)[0].label).toBe('Apr 2025')
  })

  it('US: 9.1% in the year to June 2022 (BLS)', () => {
    expect(yearlyAt(usM, 'Jun 2022')!.toFixed(1)).toBe('9.1')
    expect(yearlyAt(usM, 'Dec 2022')!.toFixed(1)).toBe('6.5')
  })

  it('skips yearly figures that have no figure 12 months earlier (US Oct 2025 was never published)', () => {
    expect(yearlyAt(usM, 'Oct 2025')).toBeUndefined()
    expect(yearlyAt(usM, 'Nov 2025')).toBeDefined()
  })
})

describe('quarterly vs monthly CPI', () => {
  const chain = monthlyChain(file, 'au')

  it('places each quarter at its last month', () => {
    const q = quarterlyLevels({ t: ['2022-Q4', '2023-Q1'], v: [1, 2] })
    expect(q.points.map((p) => p.m)).toEqual([monthNumber('2022-12'), monthNumber('2023-03')])
    expect(q.points[0].label).toBe('Dec qtr 2022')
  })

  it('the ABS quarterly index is the average of its three months (so the two can be used together)', () => {
    const m = new Map(file.series.au_cpi_m.t.map((t, i) => [t, file.series.au_cpi_m.v[i]]))
    for (const [t, v] of file.series.au_cpi_q.t.map((t, i) => [t, file.series.au_cpi_q.v[i]] as const)) {
      const [y, q] = t.split('-Q').map(Number)
      const months = [1, 2, 3].map((k) => `${y}-${String((q - 1) * 3 + k).padStart(2, '0')}`)
      if (!months.every((x) => m.has(x))) continue
      const avg = months.reduce((s, x) => s + m.get(x)!, 0) / 3
      expect(Math.abs(avg / v - 1)).toBeLessThan(0.0006)
    }
  })

  const q = new Map(file.series.au_cpi_q.t.map((t, k) => [t, file.series.au_cpi_q.v[k]]))
  const mo = new Map(file.series.au_cpi_m.t.map((t, k) => [t, file.series.au_cpi_m.v[k]]))
  const i = (ym: string) => monthNumber(ym) - chain.start
  /** Chain growth from the END of month `a` to the end of month `b`. */
  const growth = (a: string, b: string) => chain.changes.slice(i(a) + 1, i(b) + 1).reduce((g, c) => g * (1 + c), 1)

  it('places each quarter mid-quarter (it is the average of its 3 months), with the months between growing evenly', () => {
    // Dec qtr 2022 sits at Nov 2022 and Mar qtr 2023 at Feb 2023: Dec, Jan and Feb share that step
    const [dec, jan, feb] = ['2022-12', '2023-01', '2023-02'].map((ym) => chain.changes[i(ym)])
    expect(dec).toBeCloseTo(jan, 14)
    expect(jan).toBeCloseTo(feb, 14)
    expect((1 + dec) * (1 + jan) * (1 + feb)).toBeCloseTo(q.get('2023-Q1')! / q.get('2022-Q4')!, 12)
    expect(growth('2022-11', '2023-02')).toBeCloseTo(q.get('2023-Q1')! / q.get('2022-Q4')!, 12)
    // the first change is Sep 1948 (Sep qtr 1948 sits at Aug 1948)
    expect(chain.start).toBe(monthNumber('1948-09'))
  })

  it('switches to the monthly CPI in April 2024 without losing any of the rise (level-based first month)', () => {
    expect(chain.monthlyFrom).toBe(monthNumber('2024-04'))
    // Mar qtr 2024 average (at Feb) -> Apr 2024: the chain shows the full published rise (about 1.04%),
    // not a third of the quarter's rise as when quarters sat at their last month.
    expect(growth('2024-02', '2024-04')).toBeCloseTo(mo.get('2024-04')! / q.get('2024-Q1')!, 12)
    expect(growth('2024-02', '2024-04') - 1).toBeGreaterThan(0.01)
    // after that, plain monthly changes
    expect(chain.changes[i('2024-05')]).toBeCloseTo(mo.get('2024-05')! / mo.get('2024-04')! - 1, 14)
  })

  it('the whole chain matches the published index: Dec qtr 1992 (41.71) -> latest month (+148.1% to Aug 2026)', () => {
    const last = file.series.au_cpi_m.t.at(-1)!
    expect(chainEnd(chain)).toBe(monthNumber(last))
    expect(growth('1992-11', last)).toBeCloseTo(mo.get(last)! / q.get('1992-Q4')!, 10)
  })

  it('matches the monthly inflation the data pipeline gives Prediction mode (data/monthly.json), month by month', () => {
    for (const country of ['au', 'us'] as const) {
      const c = monthlyChain(file, country)
      const series = monthly.series[country === 'au' ? 'au_cpi' : 'us_cpi']
      let checked = 0
      for (let m = c.start; m <= chainEnd(c); m++) {
        const ym = `${Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, '0')}`
        const v = monthValue(monthly, series, ym)
        if (v === null) continue
        expect(Math.abs(c.changes[m - c.start] - v)).toBeLessThan(0.6 / monthly.scale)
        checked++
      }
      expect(checked).toBeGreaterThan(country === 'au' ? 900 : 1800)
    }
  })

  it('fills the missing US month (Oct 2025) by spreading the change evenly, and says so', () => {
    const us = monthlyChain(file, 'us')
    expect(us.filled).toEqual(['2025-10'])
    const k = monthNumber('2025-10') - us.start
    expect(us.changes[k]).toBeCloseTo(us.changes[k + 1], 14)
  })
})

describe('averages over a window', () => {
  it('the monthly chain gives the same average as the two end levels', () => {
    const chain = monthlyChain(file, 'us')
    // Dec 1999 → Dec 2019 from the published index
    const lv = new Map(file.series.us_cpi_m.t.map((t, i) => [t, file.series.us_cpi_m.v[i]]))
    const expected = compoundYearly(lv.get('1999-12')!, lv.get('2019-12')!, 240)
    expect(chainAverage(chain, monthNumber('2000-01'), monthNumber('2019-12')).yearly).toBeCloseTo(expected, 12)
  })

  it('the Planner button: Australia since 1993 (inflation targeting), about 2.5–3% a year', () => {
    const chain = monthlyChain(file, 'au')
    const { from, to } = windowMonths(DEFAULT_WINDOW, chain)
    expect(from).toBe(monthNumber('1993-01'))
    expect(to).toBe(chainEnd(chain))
    const avg = historicalAverage(chain, DEFAULT_WINDOW)
    expect(avg.rate).toBeGreaterThan(2.5)
    expect(avg.rate).toBeLessThan(3)
    expect(avg.label).toMatch(/^Australia, 1993–2026 average/)
    // same as working it out from the quarterly index: Dec qtr 1992 → Jun qtr 2026 is close
    const q = new Map(file.series.au_cpi_q.t.map((t, i) => [t, file.series.au_cpi_q.v[i]]))
    const fromQuarters = compoundYearly(q.get('1992-Q4')!, q.get('2026-Q2')!, (2026 - 1992) * 12 - 6) * 100
    expect(Math.abs(avg.rate - fromQuarters)).toBeLessThan(0.05)
  })

  it('last 20 years, custom years, and never less than 2 years', () => {
    const chain = monthlyChain(file, 'au')
    const end = chainEnd(chain)
    expect(windowMonths({ key: 'last20' }, chain)).toEqual({ from: end - 239, to: end })
    expect(windowMonths({ key: 'custom', from: 2000, to: 2009 }, chain)).toEqual({ from: 2000 * 12, to: 2009 * 12 + 11 })
    expect(windowMonths({ key: 'custom', from: 2026, to: 2026 }, chain).to - windowMonths({ key: 'custom', from: 2026, to: 2026 }, chain).from + 1).toBe(24)
    expect(windowMonths({ key: 'full' }, chain).from).toBe(monthNumber('1948-09'))
  })
})

describe('purchasing power', () => {
  it('hand-worked: prices doubled, so $100 then = $200 later, and $200 later = $100 then', () => {
    expect(purchasingPower(100, 50, 100)).toBe(200)
    expect(purchasingPower(200, 100, 50)).toBe(100)
  })

  it('both ways with real data round-trip exactly', () => {
    const y = yearLevels(file, 'au')
    const there = purchasingPower(100, y.years.get(1990)!, y.years.get(2025)!)
    expect(purchasingPower(there, y.years.get(2025)!, y.years.get(1990)!)).toBeCloseTo(100, 10)
    expect(there).toBeGreaterThan(200) // prices more than doubled since 1990
  })

  it('a year is the average of its four quarters (Australia) or twelve months (US)', () => {
    const au = yearLevels(file, 'au')
    const q = file.series.au_cpi_q
    const v2000 = q.t.flatMap((t, i) => (t.startsWith('2000-') ? [q.v[i]] : []))
    expect(au.years.get(2000)).toBeCloseTo(v2000.reduce((a, b) => a + b, 0) / 4, 12)
    expect(au.years.has(1948)).toBe(false) // only two quarters
    expect(au.latest.label).toBe('Aug 2026') // newest monthly figure

    const us = yearLevels(file, 'us')
    const u = file.series.us_cpi_m
    const v2019 = u.t.flatMap((t, i) => (t.startsWith('2019-') ? [u.v[i]] : []))
    expect(us.years.get(2019)).toBeCloseTo(v2019.reduce((a, b) => a + b, 0) / 12, 9)
    expect(us.years.has(2025)).toBe(true) // Oct 2025 filled in
    expect(us.first).toBe(1871)
  })
})

describe('real returns (after inflation)', () => {
  it('10% return with 3% inflation is 6.80% after inflation, not 7%', () => {
    const r = realReturn([0.1], [0.03])
    expect(r.real).toBeCloseTo(Math.pow(1.1 / 1.03, 12) - 1, 12) // one month, annualised
    expect(1.1 / 1.03 - 1).toBeCloseTo(0.067961, 6)
  })

  it('a year of 1% a month with 0.25% a month inflation', () => {
    const r = realReturn(Array(12).fill(0.01), Array(12).fill(0.0025))
    expect(r.nominal).toBeCloseTo(Math.pow(1.01, 12) - 1, 12) // 12.68%
    expect(r.inflation).toBeCloseTo(Math.pow(1.0025, 12) - 1, 12) // 3.04%
    expect(r.real).toBeCloseTo((1 + r.nominal) / (1 + r.inflation) - 1, 12)
    expect(r.realGrowth).toBeCloseTo(Math.pow(1.01 / 1.0025, 12), 12)
  })

  it('over 2 years the yearly figures are compounded', () => {
    const r = realReturn([...Array(12).fill(0.02), ...Array(12).fill(-0.01)], Array(24).fill(0))
    expect(r.nominal).toBeCloseTo(Math.sqrt(Math.pow(1.02, 12) * Math.pow(0.99, 12)) - 1, 12)
  })

  it('a US$ return seen in A$: when the A$ rises as much as the share, the A$ return is 0', () => {
    expect(toAudReturn(0.1, 0.1)).toBeCloseTo(0, 12)
    expect(toAudReturn(0, -0.2)).toBeCloseTo(0.25, 12) // A$ falls 20% → US$ assets are worth 25% more in A$
  })

  it('needs returns and inflation for the same months', () => {
    expect(() => realReturn([0.01], [])).toThrow()
  })
})

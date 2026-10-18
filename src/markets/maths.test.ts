import { describe, expect, it } from 'vitest'
import sp500Raw from '../../data/daily/SP500.json?raw'
import { decodeDaily } from '../data/decode'
import type { DailyFile, IntradayFile } from '../data/types'
import { maxDrawdown } from '../engine/bootstrap'
import {
  addBackFee,
  addMonthsISO,
  asGrowth,
  averageYearly,
  biggestDrop,
  calendarYears,
  change,
  fxLookup,
  indexOnOrBefore,
  periodStats,
  rangeStartDate,
  rangeStartIndex,
  toAud,
  volatility,
} from './maths'
import { orderedIds, swapIds } from './prefs'
import { latestQuote, intradayPoints } from './quotes'

describe('price changes', () => {
  it('works out $ and % change', () => {
    const c = change(106.7, 106.2)
    expect(c.abs).toBeCloseTo(0.5, 10)
    expect(c.pct).toBeCloseTo(0.5 / 106.2, 12) // +0.4708%
    expect(change(90, 100).pct).toBeCloseTo(-0.1, 12)
    expect(change(5, 0).pct).toBe(0)
  })

  it('turns values into % growth from the start (Compare)', () => {
    const g = asGrowth([100, 110, 99])
    expect(g[0]).toBe(0)
    expect(g[1]).toBeCloseTo(0.1, 12)
    expect(g[2]).toBeCloseTo(-0.01, 12)
  })
})

describe('chart ranges', () => {
  it('measures each range back from the latest date', () => {
    expect(rangeStartDate('1W', '2026-10-16')).toBe('2026-10-09')
    expect(rangeStartDate('1M', '2026-10-16')).toBe('2026-09-16')
    expect(rangeStartDate('3M', '2026-05-31')).toBe('2026-02-28')
    expect(rangeStartDate('YTD', '2026-10-16')).toBe('2025-12-31')
    expect(rangeStartDate('1Y', '2024-02-29')).toBe('2023-02-28')
    expect(rangeStartDate('10Y', '2026-10-16')).toBe('2016-10-16')
    expect(rangeStartDate('Max', '2026-10-16')).toBeNull()
    expect(addMonthsISO('2026-01-31', 1)).toBe('2026-02-28')
  })

  it('starts from the close on or just before the start date', () => {
    const dates = ['2025-12-30', '2025-12-31', '2026-01-02', '2026-01-05', '2026-02-05']
    expect(indexOnOrBefore(dates, '2026-01-04')).toBe(2)
    expect(indexOnOrBefore(dates, '2025-01-01')).toBe(-1)
    expect(rangeStartIndex(dates, 'YTD')).toBe(1) // last close of 2025
    expect(rangeStartIndex(dates, '1M')).toBe(3) // 5 Jan (5 Feb minus a month)
    expect(rangeStartIndex(dates, '10Y')).toBe(0) // not that much history: from the start
  })
})

describe('average yearly return (compound)', () => {
  it('is the steady yearly rate, not the simple average', () => {
    // $100 → $121 over exactly two years is 10% a year (not 10.5%)
    expect(averageYearly(100, 121, 2 * 365.25)).toBeCloseTo(0.1, 12)
    // doubling in 10 years ≈ 7.177% a year
    expect(averageYearly(50, 100, 10 * 365.25)).toBeCloseTo(Math.pow(2, 0.1) - 1, 12)
    // a fall
    expect(averageYearly(100, 81, 2 * 365.25)).toBeCloseTo(-0.1, 12)
    expect(averageYearly(100, 100, 0)).toBeNaN()
  })
})

describe('volatility', () => {
  it('is the spread of daily changes, scaled to a year by √252', () => {
    // daily changes +1%, −1%, +1%: mean 1/3%, sample variance 1.3333e-4 → √(1.3333e-4 × 252) = √0.0336
    const v = volatility([100, 101, 101 * 0.99, 101 * 0.99 * 1.01])
    expect(v).toBeCloseTo(Math.sqrt(0.0336), 10)
  })

  it('is zero for a perfectly steady climb and needs at least 3 prices', () => {
    expect(volatility([100, 101, 102.01, 103.0301])).toBeCloseTo(0, 12)
    expect(volatility([100, 101])).toBeNaN()
  })

  it('matches the S&P 500 in 2008 (roughly 41% a year)', () => {
    const sp = decodeDaily(JSON.parse(sp500Raw) as DailyFile)
    const from = indexOnOrBefore(sp.dates, '2007-12-31')
    const to = indexOnOrBefore(sp.dates, '2008-12-31')
    const v = volatility(sp.close.slice(from, to + 1))
    expect(v).toBeGreaterThan(0.38)
    expect(v).toBeLessThan(0.44)
  })
})

describe('biggest drop', () => {
  it('finds the biggest fall from a high to a later low, with dates', () => {
    const dates = ['2020-01-01', '2020-01-02', '2020-01-03', '2020-01-04', '2020-01-05', '2020-01-06']
    const v = [100, 120, 90, 110, 60, 130]
    const d = biggestDrop(dates, v, 0, 5)
    expect(d.drop).toBeCloseTo(0.5, 12) // 120 → 60
    expect(d.from).toBe('2020-01-02')
    expect(d.to).toBe('2020-01-05')
    // agrees with the shared engine's definition
    expect(d.drop).toBeCloseTo(maxDrawdown(v), 12)
    // only inside the chosen rows
    expect(biggestDrop(dates, v, 2, 3).drop).toBe(0)
  })
})

describe('best and worst calendar year', () => {
  const dates = ['2019-12-30', '2019-12-31', '2020-06-30', '2020-12-31', '2021-01-04', '2021-12-31', '2022-03-01']
  const v = [100, 100, 90, 110, 111, 99, 120]

  it('uses last close of the year before → last close of the year', () => {
    const years = calendarYears(dates, v, 0, 6)
    expect(years.map((y) => y.year)).toEqual([2020, 2021])
    expect(years[0].ret).toBeCloseTo(0.1, 12)
    expect(years[1].ret).toBeCloseTo(-0.1, 12)
  })

  it('never counts part-years', () => {
    // starting mid-2020: 2020 has no starting close inside the period
    expect(calendarYears(dates, v, 2, 6).map((y) => y.year)).toEqual([2021])
    // ending mid-2021
    expect(calendarYears(dates, v, 0, 4).map((y) => y.year)).toEqual([2020])
  })

  it('matches the S&P 500: 2008 −38.5%, 2013 +29.6% (price only)', () => {
    const sp = decodeDaily(JSON.parse(sp500Raw) as DailyFile)
    const years = calendarYears(sp.dates, sp.close, 0, sp.dates.length - 1)
    const y2008 = years.find((y) => y.year === 2008)
    const y2013 = years.find((y) => y.year === 2013)
    expect(y2008?.ret).toBeCloseTo(903.25 / 1468.36 - 1, 3) // −38.49%
    expect(y2013?.ret).toBeCloseTo(1848.36 / 1426.19 - 1, 3) // +29.60%
  })
})

describe('the history puller', () => {
  // Year-end closes over exactly 4 years (2015-12-31 → 2019-12-31 is 1,461 days = 4 × 365.25)
  const dates = ['2015-12-31', '2016-12-30', '2017-12-29', '2018-12-31', '2019-12-31']
  const price = [100, 110, 99, 120, 133.1]
  const total = [100, 108, 108 * 1.08, 108 * 1.08 * 1.08, 100 * 1.08 ** 4]

  it('shows average yearly return for price and total return, plus drop and best/worst year', () => {
    const s = periodStats(dates, price, total, 0, 4, 'price')
    expect(s).not.toBeNull()
    if (!s) return
    expect(s.days).toBe(1461)
    expect(s.years).toBeCloseTo(4, 12)
    expect(s.totalYearly).toBeCloseTo(0.08, 12)
    expect(s.priceYearly).toBeCloseTo(Math.pow(1.331, 0.25) - 1, 12)
    expect(s.priceChange).toBeCloseTo(0.331, 12)
    expect(s.biggestDrop).toBeCloseTo(0.1, 12) // 110 → 99
    expect(s.best?.year).toBe(2018)
    expect(s.best?.ret).toBeCloseTo(120 / 99 - 1, 12)
    expect(s.worst?.year).toBe(2017)
    expect(s.worst?.ret).toBeCloseTo(-0.1, 12)
  })

  it('uses the chosen basis for drop and years', () => {
    const s = periodStats(dates, price, total, 0, 4, 'total')
    expect(s?.biggestDrop).toBe(0)
    expect(s?.worst?.ret).toBeCloseTo(0.08, 12)
  })

  it('needs at least two different rows', () => {
    expect(periodStats(dates, price, total, 2, 2, 'price')).toBeNull()
  })
})

describe('US$ in A$', () => {
  const daily = { dates: ['2006-05-16', '2006-05-17'], close: [0.76, 0.75] }
  const monthly = { t: ['2006-03', '2006-04'], v: [0.71, 0.74] }
  const rate = fxLookup(daily, monthly)

  it('uses the latest known rate on or before the date', () => {
    expect(rate('2006-05-17')).toBe(0.75)
    expect(rate('2006-05-20')).toBe(0.75) // weekend: last known
    expect(rate('2006-05-10')).toBe(0.74) // before daily rates start: April's month-end
    expect(rate('2006-04-30')).toBe(0.74)
    expect(rate('2006-04-29')).toBe(0.71)
    expect(rate('2006-01-01')).toBeNull()
  })

  it('divides by US$ per A$1', () => {
    const aud = toAud(['2006-05-16', '2006-01-01'], [100, 100], rate)
    expect(aud[0]).toBeCloseTo(100 / 0.76, 10)
    expect(aud[1]).toBeNull()
  })
})

describe('latest price', () => {
  const rows = { dates: ['2026-10-15', '2026-10-16'], close: [100, 102], adj: [100, 102] }
  const intraday = (session: string): IntradayFile => ({
    market: 'asx',
    exchange: 'ASX',
    tz: 'Australia/Sydney',
    session,
    asOf: `${session}T03:00:00Z`,
    generatedAt: `${session}T03:10:00Z`,
    note: '',
    quotes: { VAS: { price: 103, time: `${session}T03:00:00Z`, prevClose: 102, change: 1, changePct: 0.98 } },
    bars: { VAS: { t0: 1000, step: 300, c: [102.5, null, 103] } },
  })

  it('uses the last close when there is nothing newer', () => {
    const q = latestQuote(rows, undefined, 'VAS')
    expect(q).toMatchObject({ price: 102, prev: 100, source: 'close', asOf: '2026-10-16' })
    expect(q?.pct).toBeCloseTo(0.02, 12)
  })

  it("uses today's 5-minute price for a newer session, and the official close once it's saved", () => {
    expect(latestQuote(rows, intraday('2026-10-19'), 'VAS')).toMatchObject({ price: 103, prev: 102, source: 'intraday' })
    expect(latestQuote(rows, intraday('2026-10-16'), 'VAS')).toMatchObject({ price: 102, source: 'close' })
    expect(latestQuote(undefined, undefined, 'VAS')).toBeNull()
  })

  it('reads 5-minute bars and skips bars with no trades', () => {
    expect(intradayPoints(intraday('2026-10-19'), 'VAS')).toEqual([
      { time: 1000, value: 102.5 },
      { time: 1600, value: 103 },
    ])
    expect(intradayPoints(undefined, 'VAS')).toEqual([])
  })
})

describe('Use in Planner', () => {
  it('adds the fund fee back, the way the Planner takes it off (1/12 each month)', () => {
    const gross = addBackFee(0.08, 0.07)
    // taking 0.07%/12 off for 12 months gets back to exactly 8%
    expect((1 + gross) * Math.pow(1 - 0.0007 / 12, 12) - 1).toBeCloseTo(0.08, 12)
    expect(gross - 0.08).toBeGreaterThan(0.0007)
    expect(gross - 0.08).toBeLessThan(0.0008)
    expect(addBackFee(0.08, 0)).toBeCloseTo(0.08, 12)
  })
})

describe('watchlist order', () => {
  it('keeps the saved order, adds new ETFs at the end, and swaps neighbours', () => {
    const all = ['VAS', 'VGS', 'IVV', 'VOO']
    expect(orderedIds(all, ['VOO', 'VAS', 'GONE'])).toEqual(['VOO', 'VAS', 'VGS', 'IVV'])
    expect(swapIds(all, ['VOO', 'VAS'], 'VGS', 'IVV')).toEqual(['VOO', 'VAS', 'IVV', 'VGS'])
  })
})

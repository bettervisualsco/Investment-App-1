// The maths behind the Markets tab: price changes, chart ranges, average yearly return, volatility,
// biggest drop, best and worst calendar year, % growth for Compare, and showing US$ prices in A$.
// Pure functions, no screen code. Returns are fractions (0.07 = 7%).

/** Days in an average year, counting leap years. Used to turn a number of days into years. */
export const DAYS_PER_YEAR = 365.25
/** Trading days in a typical year, used to turn day-to-day bumpiness into yearly volatility. */
export const TRADING_DAYS_PER_YEAR = 252

export interface Change {
  /** Change in price (same units as the price). */
  abs: number
  /** Change as a fraction (0.0123 = +1.23%). */
  pct: number
}

/** How much a price moved from `before` to `after`. */
export function change(after: number, before: number): Change {
  return { abs: after - before, pct: before === 0 ? 0 : after / before - 1 }
}

// ---- dates -----------------------------------------------------------------------------

const DAY_MS = 86_400_000

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)
}

export function addDaysISO(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Same day `n` months later (or earlier); the 31st becomes the last day of a shorter month. */
export function addMonthsISO(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate()
  return `${String(ny).padStart(4, '0')}-${String(nm).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`
}

/** Index of the last date on or before `date` (dates sorted, "YYYY-MM-DD"). -1 if every date is later. */
export function indexOnOrBefore(dates: string[], date: string): number {
  let lo = 0
  let hi = dates.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (dates[mid] <= date) {
      ans = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return ans
}

// ---- chart ranges -----------------------------------------------------------------------

export type RangeKey = '1D' | '1W' | '1M' | '3M' | '6M' | 'YTD' | '1Y' | '5Y' | '10Y' | 'Max'
export const RANGES: RangeKey[] = ['1D', '1W', '1M', '3M', '6M', 'YTD', '1Y', '5Y', '10Y', 'Max']

/**
 * Where a daily-price range starts, measured back from the latest date. The change over a range is
 * worked out from the closing price on (or just before) this date, the way most market apps do it:
 * "1M" on 16 Oct starts from the close on 16 Sep; "YTD" from the last close of last year.
 * null = from the first price there is ("Max"). 1D uses today's 5-minute prices instead.
 */
export function rangeStartDate(range: RangeKey, last: string): string | null {
  switch (range) {
    case '1D':
      return addDaysISO(last, -1)
    case '1W':
      return addDaysISO(last, -7)
    case '1M':
      return addMonthsISO(last, -1)
    case '3M':
      return addMonthsISO(last, -3)
    case '6M':
      return addMonthsISO(last, -6)
    case 'YTD':
      return `${Number(last.slice(0, 4)) - 1}-12-31`
    case '1Y':
      return addMonthsISO(last, -12)
    case '5Y':
      return addMonthsISO(last, -60)
    case '10Y':
      return addMonthsISO(last, -120)
    case 'Max':
      return null
  }
}

/** The first row index to show for a range (the close the change is measured from). */
export function rangeStartIndex(dates: string[], range: RangeKey): number {
  if (dates.length === 0) return 0
  const start = rangeStartDate(range, dates[dates.length - 1])
  if (start === null) return 0
  return Math.max(0, indexOnOrBefore(dates, start))
}

// ---- returns over a period ---------------------------------------------------------------

/**
 * Average yearly return, compounded ("CAGR"): the steady yearly rate that turns `start` into `end`
 * over `days` calendar days. E.g. $100 → $121 over two years is 10% a year, not 10.5%.
 */
export function averageYearly(start: number, end: number, days: number): number {
  if (start <= 0 || end <= 0 || days <= 0) return NaN
  return Math.pow(end / start, DAYS_PER_YEAR / days) - 1
}

/** Day-to-day changes: out[i] = values[i + 1] / values[i] − 1. */
export function dailyChanges(values: ArrayLike<number>): number[] {
  const out: number[] = []
  for (let i = 1; i < values.length; i++) out.push(values[i] / values[i - 1] - 1)
  return out
}

/**
 * Volatility: how bumpy the ride was, as a yearly figure. The spread (sample standard deviation)
 * of the daily changes, scaled up to a year by √252 trading days. NaN with fewer than 3 prices.
 */
export function volatility(values: ArrayLike<number>, periodsPerYear = TRADING_DAYS_PER_YEAR): number {
  const r = dailyChanges(values)
  if (r.length < 2) return NaN
  const mean = r.reduce((s, x) => s + x, 0) / r.length
  const variance = r.reduce((s, x) => s + (x - mean) ** 2, 0) / (r.length - 1)
  return Math.sqrt(variance) * Math.sqrt(periodsPerYear)
}

export interface YearReturn {
  year: number
  /** Change from the last close of the year before to the last close of this year. */
  ret: number
}

/**
 * Each full calendar year inside rows [from, to]: the change from the last close of the year
 * before to the last close of the year. A year only counts when both of those closes are inside
 * the period, so part-years never count.
 */
export function calendarYears(dates: string[], values: ArrayLike<number>, from: number, to: number): YearReturn[] {
  // last row of each calendar year inside the period
  const yearEnds: { year: number; i: number }[] = []
  for (let i = from; i <= to; i++) {
    const y = Number(dates[i].slice(0, 4))
    const nextYear = i + 1 < dates.length ? Number(dates[i + 1].slice(0, 4)) : null
    // the last row of a year is only "the year's close" if the next row is in a later year
    // (or the data ends exactly on 31 Dec)
    if (nextYear !== null ? nextYear > y : dates[i].slice(5) === '12-31') yearEnds.push({ year: y, i })
  }
  const out: YearReturn[] = []
  for (let k = 1; k < yearEnds.length; k++) {
    const prev = yearEnds[k - 1]
    const cur = yearEnds[k]
    if (cur.year !== prev.year + 1) continue
    out.push({ year: cur.year, ret: values[cur.i] / values[prev.i] - 1 })
  }
  return out
}

export interface PeriodStats {
  from: string
  to: string
  days: number
  years: number
  /** Average yearly return from price changes only. */
  priceYearly: number
  /** Average yearly return including distributions (total return). */
  totalYearly: number
  /** Total change over the whole period. */
  priceChange: number
  totalChange: number
  /** Yearly volatility of the chosen basis. */
  volatility: number
  /** Biggest fall from a high to a later low, as a fraction (0.35 = 35%). */
  biggestDrop: number
  /** When the biggest drop happened: the high and the low. */
  dropFrom: string | null
  dropTo: string | null
  best: YearReturn | null
  worst: YearReturn | null
  /** Every full calendar year in the period. */
  yearReturns: YearReturn[]
}

/** Biggest drop with its dates. Same answer as maxDrawdown(), plus where it happened. */
export function biggestDrop(dates: string[], values: ArrayLike<number>, from: number, to: number): { drop: number; from: string | null; to: string | null } {
  let peak = -Infinity
  let peakI = from
  let drop = 0
  let a: number | null = null
  let b: number | null = null
  for (let i = from; i <= to; i++) {
    const v = values[i]
    if (v > peak) {
      peak = v
      peakI = i
    } else if (peak > 0 && (peak - v) / peak > drop) {
      drop = (peak - v) / peak
      a = peakI
      b = i
    }
  }
  return { drop, from: a === null ? null : dates[a], to: b === null ? null : dates[b] }
}

/**
 * Everything the history puller shows for rows [from, to] (inclusive).
 * `price` is closing prices, `total` the adjusted close (distributions reinvested).
 * Volatility, biggest drop and best/worst year use `basis`.
 */
export function periodStats(
  dates: string[],
  price: ArrayLike<number>,
  total: ArrayLike<number>,
  from: number,
  to: number,
  basis: 'price' | 'total',
): PeriodStats | null {
  if (to <= from || from < 0 || to >= dates.length) return null
  const days = daysBetween(dates[from], dates[to])
  const series = basis === 'price' ? price : total
  const slice = Array.prototype.slice.call(series, from, to + 1) as number[]
  const drop = biggestDrop(dates, series, from, to)
  const years = calendarYears(dates, series, from, to)
  let best: YearReturn | null = null
  let worst: YearReturn | null = null
  for (const y of years) {
    if (!best || y.ret > best.ret) best = y
    if (!worst || y.ret < worst.ret) worst = y
  }
  return {
    from: dates[from],
    to: dates[to],
    days,
    years: days / DAYS_PER_YEAR,
    priceYearly: averageYearly(price[from], price[to], days),
    totalYearly: averageYearly(total[from], total[to], days),
    priceChange: price[to] / price[from] - 1,
    totalChange: total[to] / total[from] - 1,
    volatility: volatility(slice),
    biggestDrop: drop.drop,
    dropFrom: drop.from,
    dropTo: drop.to,
    best,
    worst,
    yearReturns: years,
  }
}

// ---- % growth (Compare) --------------------------------------------------------------------

/** Values as % growth from the first one: [100, 110, 99] → [0, 0.1, −0.01]. */
export function asGrowth(values: ArrayLike<number>): number[] {
  const out: number[] = []
  const first = values[0]
  for (let i = 0; i < values.length; i++) out.push(values[i] / first - 1)
  return out
}

// ---- US$ to A$ ---------------------------------------------------------------------------------

/**
 * A lookup of the AUD/USD rate (US$ per A$1) on a date: the latest known rate on or before it.
 * Uses daily rates where there are some, and month-end rates before that (labelled approximate).
 */
export function fxLookup(daily: { dates: string[]; close: number[] } | undefined, monthly: { t: string[]; v: number[] } | undefined): (date: string) => number | null {
  const mDates = (monthly?.t ?? []).map((ym) => {
    const [y, m] = ym.split('-').map(Number)
    return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) // last day of that month
  })
  const dailyFirst = daily?.dates[0]
  return (date: string) => {
    if (daily && dailyFirst && date >= dailyFirst) {
      const i = indexOnOrBefore(daily.dates, date)
      if (i >= 0) return daily.close[i]
    }
    const j = indexOnOrBefore(mDates, date)
    return j >= 0 ? (monthly as { v: number[] }).v[j] : null
  }
}

/** US$ prices in A$: price ÷ (US$ per A$1) on each date. Dates with no known rate become null. */
export function toAud(dates: string[], usd: ArrayLike<number>, rate: (date: string) => number | null): (number | null)[] {
  return dates.map((d, i) => {
    const r = rate(d)
    return r ? usd[i] / r : null
  })
}

// Inflation maths for the Inflation tab and the Planner's "Use historical average" button.
// Pure functions, no screen code. Everything works from the CPI price-index levels in
// data/inflation.json (ABS for Australia, BLS/FRED for the US).
//
// Months are "month numbers" (see src/data/decode.ts): "2026-08" -> year * 12 + month - 1, so
// they can be subtracted. On the history chart a quarter is placed at its last month ("2022-Q4" ->
// Dec 2022), the way the ABS labels it; the monthly chain (monthlyChain) places it mid-quarter instead.

import { monthFromNumber, monthNumber } from '../data/decode'
import type { InflationFile, LevelSeries } from '../data/types'

export type Country = 'au' | 'us'

export const COUNTRY_NAME: Record<Country, string> = { au: 'Australia', us: 'US' }
export const CPI_SOURCE: Record<Country, string> = { au: 'ABS CPI', us: 'US CPI-U' }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Aug 2026" */
export function monthLabel(m: number): string {
  return `${MONTHS[((m % 12) + 12) % 12]} ${Math.floor(m / 12)}`
}

/** One CPI figure: the period it's for (placed at its last month) and the index level. */
export interface LevelPoint {
  m: number
  level: number
  /** "Dec qtr 2022" or "Jun 2022" */
  label: string
}

export interface Levels {
  freq: 'quarterly' | 'monthly'
  points: LevelPoint[]
}

/** ABS quarterly CPI ("1948-Q3" …), each quarter placed at its last month. */
export function quarterlyLevels(s: LevelSeries): Levels {
  const points = s.t.map((t, i) => {
    const [y, q] = t.split('-Q').map(Number)
    const m = y * 12 + q * 3 - 1
    return { m, level: s.v[i], label: `${MONTHS[q * 3 - 1]} qtr ${y}` }
  })
  return { freq: 'quarterly', points }
}

/** A monthly CPI ("2024-04" …). Missing months stay missing here (nothing is made up). */
export function monthlyLevels(s: LevelSeries): Levels {
  const points = s.t.map((t, i) => {
    const m = monthNumber(t)
    return { m, level: s.v[i], label: monthLabel(m) }
  })
  return { freq: 'monthly', points }
}

/** The CPI series shown on the history chart. Australia has two: the long quarterly one and the newer monthly one. */
export type HistorySeries = 'au_q' | 'au_m' | 'us_m'

export function historyLevels(file: InflationFile, which: HistorySeries): Levels {
  if (which === 'au_q') return quarterlyLevels(file.series.au_cpi_q)
  if (which === 'au_m') return monthlyLevels(file.series.au_cpi_m)
  return monthlyLevels(file.series.us_cpi_m)
}

export interface YearlyPoint {
  m: number
  label: string
  /** Rise in prices over the 12 months to this point, % (7.8 = 7.8%). */
  pct: number
}

/**
 * Yearly inflation at each point: the rise in the index over the 12 months to it (the way the ABS
 * and BLS quote their headline figure). Points without a figure exactly 12 months earlier are skipped.
 */
export function yearlyInflation(levels: Levels): YearlyPoint[] {
  const byMonth = new Map(levels.points.map((p) => [p.m, p.level]))
  const out: YearlyPoint[] = []
  for (const p of levels.points) {
    const before = byMonth.get(p.m - 12)
    if (before !== undefined) out.push({ m: p.m, label: p.label, pct: (p.level / before - 1) * 100 })
  }
  return out
}

/** Average yearly rate (compounded) that turns `from` into `to` over `months` months, as a fraction (0.025 = 2.5%). */
export function compoundYearly(from: number, to: number, months: number): number {
  if (!(from > 0) || !(to > 0) || !(months > 0)) return NaN
  return Math.pow(to / from, 12 / months) - 1
}

export interface WindowChange {
  from: LevelPoint
  to: LevelPoint
  months: number
  /** How much prices rose over the whole window, as a fraction. */
  total: number
  /** Average yearly inflation over the window, compounded, as a fraction. */
  yearly: number
}

/** Price rise between two CPI figures (by index in `levels.points`), and the compound average a year. */
export function windowChange(levels: Levels, a: number, b: number): WindowChange | null {
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  const from = levels.points[lo]
  const to = levels.points[hi]
  if (!from || !to || hi === lo) return null
  const months = to.m - from.m
  return { from, to, months, total: to.level / from.level - 1, yearly: compoundYearly(from.level, to.level, months) }
}

// ---- one monthly chain per country (for predictions, real returns and averages) -------------------

export interface MonthlyChain {
  country: Country
  /** Month number of changes[0]. */
  start: number
  /** Change in prices during each month, as a fraction. */
  changes: number[]
  /** Index level at the END of each month (levels[i] goes with changes[i]); level before the first change is `base`. */
  levels: number[]
  base: number
  /** First month taken from a true monthly CPI (Australia: the ABS complete Monthly CPI, April 2024). Earlier Australian months grow evenly between the quarterly figures, each placed at its quarter's middle month. */
  monthlyFrom: number
  /** Months with no published figure, filled by spreading the change evenly. */
  filled: string[]
}

/** Each month's change between consecutive levels, filling any missing months by spreading the change evenly (compounded). */
function monthlyChanges(points: LevelPoint[]): { changes: Map<number, number>; filled: number[] } {
  const changes = new Map<number, number>()
  const filled: number[] = []
  for (let i = 1; i < points.length; i++) {
    const gap = points[i].m - points[i - 1].m
    if (gap < 1) continue
    const step = Math.pow(points[i].level / points[i - 1].level, 1 / gap) - 1
    for (let k = 1; k <= gap; k++) {
      changes.set(points[i - 1].m + k, step)
      if (k < gap) filled.push(points[i - 1].m + k)
    }
  }
  return { changes, filled }
}

/**
 * One continuous monthly inflation series for a country.
 * Australia: before the complete Monthly CPI (April 2024), only quarterly figures exist. A quarterly
 * index is the AVERAGE of its three months, so it is placed at the quarter's middle month (Feb, May,
 * Aug, Nov), and each month between two middle months grows by the same amount (the geometric third
 * of the step). From April 2024 the monthly CPI is used; April's change is level-based (April's index
 * ÷ the chain's level for March − 1; both ABS series are on the Sep 2025 = 100 base), so no part of
 * the rise is lost at the switch. Exactly how the data pipeline builds `au_cpi` in data/monthly.json
 * (pipeline/datapipe/monthly.py au_cpi_monthly; a test checks they match).
 * US: the monthly CPI, with any missing month (October 2025 was never published) filled evenly.
 */
export function monthlyChain(file: InflationFile, country: Country): MonthlyChain {
  const all = new Map<number, number>()
  let monthlyFrom: number
  let filledMonths: number[] = []
  if (country === 'au') {
    const q = file.series.au_cpi_q
    // each quarterly index at its middle month: "2024-Q1" -> Feb 2024
    const mid = q.t.map((t, i) => {
      const [y, n] = t.split('-Q').map(Number)
      return { m: y * 12 + (n - 1) * 3 + 1, level: q.v[i] }
    })
    const level = new Map<number, number>([[mid[0].m, mid[0].level]]) // chain level on the ABS base
    const perMonth = new Map<number, number>()
    for (let i = 1; i < mid.length; i++) {
      const gap = mid[i].m - mid[i - 1].m
      const step = Math.pow(mid[i].level / mid[i - 1].level, 1 / gap)
      for (let k = 1; k <= gap; k++) {
        level.set(mid[i - 1].m + k, mid[i - 1].level * Math.pow(step, k))
        perMonth.set(mid[i - 1].m + k, step - 1)
      }
    }
    const mPts = monthlyLevels(file.series.au_cpi_m).points
    monthlyFrom = mPts[0].m
    const before = level.get(monthlyFrom - 1)
    if (before === undefined) throw new Error(`monthlyChain: no quarterly CPI level for ${monthFromNumber(monthlyFrom - 1)}`)
    for (const [m, v] of perMonth) if (m < monthlyFrom) all.set(m, v)
    all.set(monthlyFrom, mPts[0].level / before - 1)
    const monthly = monthlyChanges(mPts)
    for (const [m, v] of monthly.changes) all.set(m, v)
    filledMonths = monthly.filled
  } else {
    const monthly = monthlyChanges(monthlyLevels(file.series.us_cpi_m).points)
    for (const [m, v] of monthly.changes) all.set(m, v)
    monthlyFrom = Math.min(...monthly.changes.keys())
    filledMonths = monthly.filled
  }
  const start = Math.min(...all.keys())
  const end = Math.max(...all.keys())
  const changes: number[] = []
  for (let m = start; m <= end; m++) changes.push(all.get(m) ?? 0)
  const base = 100
  const levels: number[] = []
  let level = base
  for (const c of changes) levels.push((level *= 1 + c))
  return { country, start, changes, levels, base, monthlyFrom, filled: filledMonths.map(monthFromNumber) }
}

/** Last month in the chain. */
export function chainEnd(chain: MonthlyChain): number {
  return chain.start + chain.changes.length - 1
}

/** The chain's monthly changes from `from` to `to` (month numbers, inclusive), clipped to the data. */
export function chainSlice(chain: MonthlyChain, from: number, to: number): number[] {
  const a = Math.max(from, chain.start) - chain.start
  const b = Math.min(to, chainEnd(chain)) - chain.start
  return b >= a ? chain.changes.slice(a, b + 1) : []
}

/** Average yearly inflation (compounded) over the months from `from` to `to` inclusive, as a fraction. */
export function chainAverage(chain: MonthlyChain, from: number, to: number): { yearly: number; months: number; from: number; to: number } {
  const lo = Math.max(from, chain.start)
  const hi = Math.min(to, chainEnd(chain))
  const slice = chainSlice(chain, lo, hi)
  const growth = slice.reduce((g, c) => g * (1 + c), 1)
  return { yearly: slice.length ? Math.pow(growth, 12 / slice.length) - 1 : NaN, months: slice.length, from: lo, to: hi }
}

// ---- purchasing power ---------------------------------------------------------------------

/** What `amount` at price level `fromLevel` is worth at price level `toLevel` (same buying power). */
export function purchasingPower(amount: number, fromLevel: number, toLevel: number): number {
  return (amount * toLevel) / fromLevel
}

export interface YearLevels {
  /** Average index level for each complete calendar year. */
  years: Map<number, number>
  first: number
  /** Last complete calendar year. */
  lastFull: number
  /** The most recent figure (used for "now"). */
  latest: { m: number; level: number; label: string }
}

/**
 * Price levels for the purchasing power calculator: each complete calendar year's average index
 * (Australia: the four quarters; US: the twelve months, with any missing month filled evenly), and
 * the latest figure for "now". For Australia the latest is the monthly CPI when it's newer than the
 * last quarter; the ABS's quarterly index is the average of its three months, so they line up.
 */
export function yearLevels(file: InflationFile, country: Country): YearLevels {
  const years = new Map<number, number>()
  let latest: YearLevels['latest']
  if (country === 'au') {
    const q = quarterlyLevels(file.series.au_cpi_q).points
    const byYear = new Map<number, number[]>()
    for (const p of q) {
      const y = Math.floor(p.m / 12)
      byYear.set(y, [...(byYear.get(y) ?? []), p.level])
    }
    for (const [y, v] of byYear) if (v.length === 4) years.set(y, v.reduce((a, b) => a + b, 0) / 4)
    const lastQ = q[q.length - 1]
    const mPts = monthlyLevels(file.series.au_cpi_m).points
    const lastM = mPts[mPts.length - 1]
    latest = lastM && lastM.m > lastQ.m ? { m: lastM.m, level: lastM.level, label: lastM.label } : { m: lastQ.m, level: lastQ.level, label: lastQ.label }
  } else {
    const chain = monthlyChain(file, 'us')
    const byYear = new Map<number, number[]>()
    // chain levels are on the chain's own base, so rescale to the published index
    const pts = file.series.us_cpi_m
    const scale = pts.v[0] / chain.base
    const first = monthNumber(pts.t[0])
    const levelAt = (m: number) => (m === first ? chain.base : chain.levels[m - chain.start]) * scale
    for (let m = first; m <= chainEnd(chain); m++) {
      const y = Math.floor(m / 12)
      byYear.set(y, [...(byYear.get(y) ?? []), levelAt(m)])
    }
    for (const [y, v] of byYear) if (v.length === 12) years.set(y, v.reduce((a, b) => a + b, 0) / 12)
    const last = monthlyLevels(pts).points.at(-1) as LevelPoint
    latest = { m: last.m, level: last.level, label: last.label }
  }
  const keys = [...years.keys()]
  return { years, first: Math.min(...keys), lastFull: Math.max(...keys), latest }
}

// ---- real returns -----------------------------------------------------------------------------

export interface RealReturn {
  months: number
  /** Average yearly return before inflation, as a fraction (compounded). */
  nominal: number
  /** Average yearly inflation over the same months, as a fraction (compounded). */
  inflation: number
  /** Average yearly return after inflation, as a fraction (compounded). */
  real: number
  /** What $1 grew to, in money of the end date. */
  growth: number
  /** What $1 grew to, in money of the start date (buying power). */
  realGrowth: number
}

/**
 * Returns after inflation, from monthly returns and the same months' inflation (both fractions,
 * same length, same months). Real growth = (growth in dollars) ÷ (growth in prices), so a 10%
 * return with 3% inflation is 1.10 / 1.03 − 1 = 6.8% after inflation (not 7%).
 */
export function realReturn(returns: number[], inflation: number[]): RealReturn {
  if (returns.length !== inflation.length) throw new Error('realReturn: returns and inflation must cover the same months')
  const n = returns.length
  if (n === 0) return { months: 0, nominal: NaN, inflation: NaN, real: NaN, growth: NaN, realGrowth: NaN }
  let g = 1
  let p = 1
  for (let i = 0; i < n; i++) {
    g *= 1 + returns[i]
    p *= 1 + inflation[i]
  }
  const yearly = (x: number) => Math.pow(x, 12 / n) - 1
  return { months: n, nominal: yearly(g), inflation: yearly(p), real: yearly(g / p), growth: g, realGrowth: g / p }
}

/** An A$ investor's monthly return on a US$ asset: (1 + US$ return) ÷ (1 + change in US$ per A$1) − 1. */
export function toAudReturn(usdReturn: number, audusdChange: number): number {
  return (1 + usdReturn) / (1 + audusdChange) - 1
}

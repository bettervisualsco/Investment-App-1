// The buying-power calculator's maths: what money at one time is worth at another. Pure functions.

import { purchasingPower, type YearLevels } from './cpi'

/** A point in time for the calculator: a past calendar year, "now" (the latest CPI figure), or a future year. */
export type When = string // '1990' | 'now' | '2036'

export interface PowerAnswer {
  kind: 'exact' | 'estimate'
  value: number
  low?: number
  high?: number
  /** Exact only: how much prices rose from the earlier date to the later one, as a fraction, and the average a year (when a year or more apart). */
  rise?: number
  yearly?: number
}

/**
 * What `amount` at time A is worth at time B. Past years and "now" use the real CPI; future years
 * use the prediction (low/likely/high), each simulated future used for both ends.
 */
export function powerAnswer(amount: number, a: When, b: When, y: YearLevels, future: ((fromYear: number, toYear: number) => { low: number; mid: number; high: number }) | null): PowerAnswer | null {
  const latestYear = Math.floor(y.latest.m / 12)
  // level for past/now, or years ahead of the latest figure for the future
  const info = (w: When) => (w === 'now' ? { level: y.latest.level, ahead: 0 } : Number(w) > latestYear ? { level: y.latest.level, ahead: Number(w) - latestYear } : { level: y.years.get(Number(w)), ahead: 0 })
  const A = info(a)
  const B = info(b)
  if (A.level === undefined || B.level === undefined) return null
  const base = purchasingPower(amount, A.level, B.level)
  if (A.ahead === 0 && B.ahead === 0) {
    // the rise in prices from the earlier date to the later one (whichever way round they were picked)
    const [early, late] = monthOf(a, y) <= monthOf(b, y) ? [A.level, B.level] : [B.level, A.level]
    const months = Math.abs(monthOf(b, y) - monthOf(a, y))
    return { kind: 'exact', value: base, rise: late / early - 1, yearly: months >= 12 ? Math.pow(late / early, 12 / months) - 1 : undefined }
  }
  if (!future) return null
  const lo = Math.min(A.ahead, B.ahead)
  const hi = Math.max(A.ahead, B.ahead)
  const g = future(lo, hi)
  // going forward in time multiplies by the price growth, going back divides (so low and high swap)
  const forward = B.ahead >= A.ahead
  return forward
    ? { kind: 'estimate', value: base * g.mid, low: base * g.low, high: base * g.high }
    : { kind: 'estimate', value: base / g.mid, low: base / g.high, high: base / g.low }
}

/** Roughly where a year sits, in months: the middle of a past year, or the latest figure for now. */
function monthOf(w: When, y: YearLevels): number {
  return w === 'now' ? y.latest.m : Number(w) * 12 + 6
}

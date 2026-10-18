// The latest price of each ETF / index, from today's 5-minute prices when there are newer ones,
// otherwise from the daily closing prices. Pure functions, no screen code.

import type { DailyRows } from '../data/decode'
import type { IntradayFile } from '../data/types'
import { change, type Change } from './maths'

export interface LatestQuote extends Change {
  price: number
  /** The price the change is measured from (the close before). */
  prev: number
  /** A date ("YYYY-MM-DD", a day's close) or a time ("…T…Z", a 5-minute price during the day). */
  asOf: string
  source: 'intraday' | 'close'
}

/**
 * Today's 5-minute prices are used only when they're for a newer trading day than the last saved
 * close; once the day's close is saved, the official close is used.
 */
export function latestQuote(rows: DailyRows | undefined, intraday: IntradayFile | undefined, id: string): LatestQuote | null {
  const n = rows?.dates.length ?? 0
  const lastDate = n ? (rows as DailyRows).dates[n - 1] : ''
  const q = intraday?.quotes[id]
  if (intraday && q && intraday.session > lastDate) {
    const prev = q.prevClose ?? (n ? (rows as DailyRows).close[n - 1] : q.price)
    return { price: q.price, prev, ...change(q.price, prev), asOf: q.time, source: 'intraday' }
  }
  if (!rows || n === 0) return null
  const price = rows.close[n - 1]
  const prev = n > 1 ? rows.close[n - 2] : price
  return { price, prev, ...change(price, prev), asOf: lastDate, source: 'close' }
}

export interface IntradayPoint {
  /** Unix seconds (start of the 5-minute bar). */
  time: number
  value: number
}

/** The 5-minute prices for one ETF / index (bars with no trade are skipped). */
export function intradayPoints(file: IntradayFile | undefined, id: string): IntradayPoint[] {
  const b = file?.bars[id]
  if (!b) return []
  const out: IntradayPoint[] = []
  b.c.forEach((v, i) => {
    if (v !== null && Number.isFinite(v)) out.push({ time: b.t0 + i * b.step, value: v })
  })
  return out
}

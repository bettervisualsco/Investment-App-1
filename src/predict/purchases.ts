// Several purchases of one holding: how today's value splits between them, estimated from price history.
// An earlier purchase at a lower price bought more units, so it's worth a bigger share of today's value.
// No screen code: the price lookup is passed in.

import type { DailyRows } from '../data'
import type { Investment, Purchase } from '../engine/types'

/** The close on or before a date (null if the date is before the first row). */
export function closeOnOrBefore(rows: DailyRows, date: string): number | null {
  let lo = 0
  let hi = rows.dates.length - 1
  if (hi < 0 || date < rows.dates[0]) return null
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (rows.dates[mid] <= date) lo = mid
    else hi = mid - 1
  }
  return rows.close[lo]
}

/** The middle of a purchase's month: purchases are stored as the 1st, but "roughly when" means sometime that month. */
function midMonth(boughtOn: string): string {
  return `${boughtOn.slice(0, 7)}-15`
}

/**
 * Each purchase's estimated share of today's value, in cents, adding up to `total`. Null when it can't be
 * estimated from prices (a savings account, a custom asset, or a purchase from before an ETF's price history):
 * the engine then shares the value in proportion to what was paid.
 *
 * For one ETF, a purchase's weight is what it paid × (today's price ÷ the price then): the units it bought, at
 * today's price. For a mix, each purchase is split across the mix's ETFs by their shares.
 */
export function estimatePurchaseValues(
  inv: Investment | undefined,
  purchases: Purchase[],
  total: number,
  rowsFor: (etf: string) => DailyRows | undefined,
): number[] | null {
  if (purchases.length < 2 || !(total > 0) || !inv) return null
  const parts = inv.kind === 'etf' ? [{ etf: inv.etf, weight: 100 }] : inv.kind === 'mix' ? inv.parts : null
  if (!parts || parts.length === 0) return null
  const sumW = parts.reduce((s, p) => s + p.weight, 0)
  if (!(sumW > 0)) return null
  const weights: number[] = []
  for (const p of purchases) {
    let growth = 0
    for (const part of parts) {
      const rows = rowsFor(part.etf)
      if (!rows || rows.dates.length === 0) return null
      const then = closeOnOrBefore(rows, midMonth(p.boughtOn))
      const now = rows.close[rows.close.length - 1]
      if (!then || !(then > 0) || !(now > 0)) return null
      growth += (part.weight / sumW) * (now / then)
    }
    weights.push(Math.max(0, p.paid) * growth)
  }
  const sum = weights.reduce((a, b) => a + b, 0)
  if (!(sum > 0)) return null
  // Whole cents, with any rounding left over on the last purchase so they add up exactly.
  const values = weights.map((w) => Math.round((total * w) / sum))
  values[values.length - 1] += total - values.reduce((a, b) => a + b, 0)
  return values
}

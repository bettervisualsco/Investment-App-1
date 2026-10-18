// Fees: brokerage on each trade, plus the sum needed to sell so you end up
// with a set amount of cash after costs. The other fees (MER, platform fee,
// spread, currency conversion) are simple percentages or amounts and are
// applied inside the day-by-day simulation (simulate.ts).

import type { Brokerage } from './types'

/** Brokerage in cents for one trade of `amount` cents. Never more than the trade itself. */
export function brokerageFor(b: Brokerage, amount: number): number {
  if (amount <= 0) return 0
  let fee: number
  switch (b.kind) {
    case 'flat':
      fee = b.fee
      break
    case 'percent':
      fee = Math.max(b.min, (amount * b.pct) / 100)
      break
    case 'tiered': {
      const tier = b.tiers.find((t) => t.upTo === null || amount <= t.upTo) ?? b.tiers[b.tiers.length - 1]
      fee = tier ? tier.fee + (amount * tier.pct) / 100 : 0
      break
    }
  }
  return Math.min(Math.max(0, fee), amount)
}

/** Costs of selling `gross` cents' worth: brokerage, spread and (if US-listed) currency conversion. */
export function saleCosts(gross: number, b: Brokerage | null, spreadPct: number, fxPct: number) {
  const spread = (gross * spreadPct) / 100
  const fx = ((gross - spread) * fxPct) / 100
  const brokerage = b ? brokerageFor(b, gross) : 0
  return { spread, fx, brokerage, net: Math.max(0, gross - spread - fx - brokerage) }
}

/**
 * How much (in cents of investment value) you need to sell so that, after
 * costs, `wanted` cents of cash is left. Brokerage can depend on the trade
 * size, so this tries a few times and settles on an amount that is enough.
 */
export function grossForNet(wanted: number, b: Brokerage | null, spreadPct: number, fxPct: number): number {
  if (wanted <= 0) return 0
  const keep = (1 - spreadPct / 100) * (1 - fxPct / 100)
  if (keep <= 0) return Infinity
  // net(gross) = gross × keep − brokerage(gross). Brokerage only grows with
  // the trade size, so each guess is at least as big as the last.
  let gross = wanted / keep
  for (let i = 0; i < 12; i++) {
    if (saleCosts(gross, b, spreadPct, fxPct).net >= wanted - 1e-7) break
    gross = (wanted + (b ? brokerageFor(b, gross) : 0)) / keep
  }
  return gross
}

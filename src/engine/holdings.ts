// "Money you have now": the starting balance, what it's invested in, what you
// paid for it and when you bought it.
//
// A plan without `startingMoney` behaves exactly as before: the starting
// balance is part of the first phase's investment, bought on the start date for
// its value. With it, the money can be entered as one amount or as a list of
// holdings, and each holding is either:
//
//   - part of the plan's own investment ("Same as the first phase", or the
//     same investment as the first phase): its tax lot keeps its real cost
//     base and purchase date, and it grows with the phases, or
//   - a separate holding (something different): with "Keep them as they are"
//     it keeps its own investment, return, fee and distributions for the
//     whole plan; with "Move them into my plan's investments" it is sold on
//     the start date and the money put into the first phase's investment.
//
// Plain data helpers only; the day-by-day work is in simulate.ts.

import type { Holding, HoldingDetails, Investment, Plan } from './types'

/** Manual-mode return for a holding kept separately when none was typed, % a year. */
export const DEFAULT_HOLDING_RETURN = 7

/** Id used for the "one amount" holding. */
export const SINGLE_HOLDING_ID = 'starting-balance'

/** The money you have now as a list of holdings (one for "one amount"). Their values add up to the starting balance. */
export function startingHoldings(plan: Plan): Holding[] {
  const sm = plan.startingMoney
  if (!sm || sm.entry !== 'holdings') {
    return [{ ...(sm?.single ?? {}), id: SINGLE_HOLDING_ID, value: plan.startingBalance }]
  }
  return sm.holdings ?? []
}

/** The starting balance the engine uses: plan.startingBalance, or the total of the holdings. */
export function startingTotal(plan: Plan): number {
  const sm = plan.startingMoney
  if (!sm || sm.entry !== 'holdings') return plan.startingBalance
  return (sm.holdings ?? []).reduce((sum, h) => sum + h.value, 0)
}

/** True if two investment choices are the same (same ETF, same mix, same savings rate, same custom asset). */
export function sameInvestment(a: Investment | undefined, b: Investment | undefined): boolean {
  if (!a || !b) return a === b
  if (a.kind !== b.kind) return false
  switch (a.kind) {
    case 'etf':
      return a.etf === (b as typeof a).etf
    case 'cash':
      return a.rate === (b as typeof a).rate
    case 'mix': {
      const bp = (b as typeof a).parts
      return a.parts.length === bp.length && a.parts.every((p, i) => p.etf === bp[i].etf && p.weight === bp[i].weight)
    }
    case 'custom': {
      const bc = b as typeof a
      return a.mean === bc.mean && a.volatility === bc.volatility && a.crashes?.everyYears === bc.crashes?.everyYears && a.crashes?.drop === bc.crashes?.drop
    }
  }
}

/** A holding in something different from the first phase's investment (so it's kept or moved, not simply part of the plan). */
export function isSeparate(plan: Plan, h: Holding): boolean {
  return h.investment !== undefined && !sameInvestment(h.investment, plan.phases[0]?.investment)
}

/** "keep" (default) or "move", for separate holdings. */
export function holdingHandling(plan: Plan): 'keep' | 'move' {
  return plan.startingMoney?.handling === 'move' ? 'move' : 'keep'
}

/** Holdings that are kept separately for the whole plan (they need their own returns, and their own history in Prediction mode). */
export function keptHoldings(plan: Plan): Holding[] {
  if (holdingHandling(plan) === 'move') return []
  return startingHoldings(plan).filter((h) => h.value > 0 && isSeparate(plan, h))
}

/** True if any holding is in something different from the first phase's investment (the Keep / Move choice matters). */
export function hasSeparateHoldings(plan: Plan): boolean {
  return startingHoldings(plan).some((h) => isSeparate(plan, h))
}

/** One purchase of a holding, ready for the tax lots: when, what was paid, and its share of today's value (cents). */
export interface HoldingPurchase {
  /** Missing → bought on the plan's start date. */
  boughtOn?: string
  cost: number
  value: number
}

/**
 * A holding's purchases, oldest first. Several purchases (`purchases`) each become their own tax lot; otherwise
 * it's one purchase from `costBase` / `boughtOn` (missing: today's value, bought on the start date).
 * Today's value is shared between purchases by their estimated `value` (scaled to add up to the holding's value),
 * or in proportion to what was paid when there's no estimate.
 */
export function holdingPurchases(h: HoldingDetails & { value: number }): HoldingPurchase[] {
  const list = h.purchases
  if (!list || list.length === 0) return [{ boughtOn: h.boughtOn, cost: h.costBase ?? h.value, value: h.value }]
  const estimates = list.map((p) => (typeof p.value === 'number' && Number.isFinite(p.value) && p.value >= 0 ? p.value : NaN))
  const haveEstimates = estimates.every((v) => !Number.isNaN(v)) && estimates.reduce((a, b) => a + b, 0) > 0
  const weights = haveEstimates ? estimates : list.map((p) => Math.max(0, p.paid))
  const total = weights.reduce((a, b) => a + b, 0)
  return list
    .map((p, i) => ({ boughtOn: p.boughtOn, cost: p.paid, value: total > 0 ? (h.value * weights[i]) / total : h.value / list.length }))
    .sort((a, b) => (a.boughtOn ?? '').localeCompare(b.boughtOn ?? ''))
}

/** Total paid for a holding (all its purchases), cents. */
export function holdingCost(h: HoldingDetails & { value: number }): number {
  return holdingPurchases(h).reduce((sum, p) => sum + p.cost, 0)
}

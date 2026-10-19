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

import type { Holding, Investment, Plan } from './types'

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

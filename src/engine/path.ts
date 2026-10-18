// Where the returns and inflation come from. The simulation doesn't care:
// it is handed a MarketPath with one growth factor and one inflation factor
// per day of the plan.
//
//   - Manual mode: manualPath() builds it from the rates you typed.
//   - Prediction mode (stage 3): build one MarketPath per simulated history
//     (e.g. from sampled months: each month's return r becomes a daily factor
//     (1 + r)^(1 / days in that month)), then call simulate() for each.
//     Fees and tax are applied by simulate(), so they work the same in both modes.

import type { CompiledPlan } from './compile'
import { valueByDay } from './varying'

export interface MarketPath {
  /**
   * For each day of the plan: how much the investment grows that day, as a
   * factor (1.0002 = +0.02%). This is the total return (price + distributions,
   * in AUD), before fees and tax.
   */
  growth: Float64Array
  /** For each day: how much prices (CPI) rise that day, as a factor. */
  inflation: Float64Array
  /** Optional: daily factor earned by waiting cash (e.g. from RBA cash-rate history). If missing, the Fees "cash rate" is used. */
  cash?: Float64Array
  /**
   * Optional: daily factor for the part of the growth that is income (distributions or interest),
   * used with Tax on. 0 on a day (or missing) → the phase's distribution yield. Prediction mode
   * sets it on cash/savings days, where each month's whole return is interest.
   */
  income?: Float64Array
  warnings: string[]
}

/** Daily factor for a yearly rate, where each calendar month is exactly 1/12 of a year shared across its days. */
export function dailyFactor(yearlyPct: number, daysInMonth: number): number {
  return Math.pow(1 + yearlyPct / 100, 1 / (12 * daysInMonth))
}

/** Manual mode: the return rates typed into each phase, and the inflation rate from the Inflation settings. */
export function manualPath(c: CompiledPlan): MarketPath {
  const warnings: string[] = []
  const growth = new Float64Array(c.n)
  const inflation = new Float64Array(c.n)

  // A cash/savings phase grows at its savings rate; everything else at the return rate typed in the phase.
  const rateFns = c.plan.phases.map((phase, i) => {
    const inv = phase.investment
    if (inv?.kind === 'cash') return () => inv.rate
    return valueByDay(phase.returnRate, c.ranges[i].start, c.ranges[i].end)
  })
  let clampWarned = false
  for (let t = 0; t < c.n; t++) {
    let rate = rateFns[c.phaseOf[t]](c.startDay + t) / 100
    if (rate <= -0.9999) {
      rate = -0.9999
      if (!clampWarned) {
        warnings.push('A return rate reached −100% or lower, so it was treated as −99.99%.')
        clampWarned = true
      }
    }
    growth[t] = rate === 0 ? 1 : Math.pow(1 + rate, 1 / (12 * c.dim[t]))
  }

  const inflationFn = valueByDay(c.realism.inflationSettings.rate, c.startDay, c.endDay)
  let inflationWarned = false
  for (let t = 0; t < c.n; t++) {
    let rate = inflationFn(c.startDay + t)
    if (rate <= -99) {
      rate = -99
      if (!inflationWarned) {
        warnings.push('An inflation rate reached −99% or lower, so it was treated as −99%.')
        inflationWarned = true
      }
    }
    inflation[t] = rate === 0 ? 1 : dailyFactor(rate, c.dim[t])
  }

  return { growth, inflation, warnings }
}

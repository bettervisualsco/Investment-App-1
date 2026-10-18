// Small helpers for showing results with the realism switches.

import type { ManualResult } from '../engine/manual'
import type { Plan, Realism } from '../engine/types'

export function realismOf(plan: Plan): Realism {
  return plan.realism ?? { fees: false, tax: false, inflation: false }
}

/** Numbers to show: in today's dollars when the Inflation switch is on, otherwise as they'll be. */
export function viewOf(result: ManualResult) {
  const real = result.switches.inflation
  const r = result.real
  return {
    real,
    final: real ? result.finalReal : result.finalBalance,
    deposited: real ? r.deposited : result.totalDeposited,
    withdrawn: real ? r.withdrawn : result.totalWithdrawn,
    net: real ? r.netContributed : result.netContributed,
    fees: real ? r.fees : result.fees.total,
    tax: real ? r.tax : result.tax.total,
    paidOut: real ? r.paidOut : result.totalPaidOut,
    /** Growth before fees and tax (after inflation, in today's dollars). */
    growth: real ? r.growth : result.totalGrowth,
    /** Turns an end-of-plan amount into what's shown. */
    atEnd: (cents: number) => (real ? cents / result.cpiEnd : cents),
  }
}

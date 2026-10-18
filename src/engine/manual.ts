// Manual mode: grows the plan using the return rates you typed in.
//
// How the maths works (also explained in the app's ⓘ notes):
//   - Rates are yearly returns. 7% means $100 becomes $107 after a full year.
//   - Growth is added every day. Each calendar month counts as exactly 1/12
//     of a year, shared evenly across its days. So 12 whole months at 7%
//     always gives exactly 7%, no matter how many days are in the months.
//   - Deposits and one-off events land at the START of their day and grow
//     from that day on.
//   - Deposits and withdrawals are whole cents. Growth is tracked to a
//     fraction of a cent and only rounded when shown.
//
// The day-by-day work (including fees and tax) is in simulate.ts; Manual mode
// just feeds it one path built from your typed rates (path.ts).

import { compilePlan, type CompiledPlan } from './compile'
import { manualPath } from './path'
import { ALL_OFF, simulate, type GoalCheck, type SimResult, type Switches } from './simulate'
import type { Plan } from './types'
import { validatePlan } from './validate'

export type { SeriesPoint, YearRow, FeeTotals, TaxTotals, EndSale } from './simulate'

export interface PhaseSummary {
  phaseId: string
  start: number
  end: number // exclusive
  depositCount: number
  depositTotal: number // cents
  firstDeposit: number | null
  lastDeposit: number | null
}

export type GoalResult = GoalCheck

export interface ManualResult extends Omit<SimResult, 'phases'> {
  phases: PhaseSummary[]
}

/** Adds each phase's id and dates to a simulation's phase totals. */
export function withPhaseInfo(c: CompiledPlan, r: SimResult): ManualResult {
  return {
    ...r,
    phases: r.phases.map((p, i) => ({ phaseId: c.plan.phases[i].id, start: c.ranges[i].start, end: c.ranges[i].end, ...p })),
  }
}

function compileChecked(plan: Plan): CompiledPlan {
  const problems = validatePlan(plan)
  if (problems.length > 0) throw new Error(problems.map((p) => p.message).join(' '))
  return compilePlan(plan)
}

/** Runs the plan with its own switches (or the ones given). */
export function runManual(plan: Plan, switches?: Switches): ManualResult {
  const c = compileChecked(plan)
  return withPhaseInfo(c, simulate(c, manualPath(c), { switches }))
}

export interface CostStep {
  /** Which switch this step turns on. */
  switch: 'fees' | 'tax' | 'inflation'
  /** Final amount once this switch is also on (inflation: in today's dollars). */
  after: number
  /** How much this switch takes away (positive = it costs you). */
  cost: number
}

export interface CostComparison {
  /** The plan with every switch off. */
  allOff: ManualResult
  /** The plan with its switches as set. */
  actual: ManualResult
  /** Turning on the plan's switches one at a time, in the order fees → tax → inflation. */
  steps: CostStep[]
}

/**
 * "Show the cost": the result with all switches off, and how much each switch
 * that's on takes away. Switches are added one at a time (fees, then tax,
 * then inflation), so each cost is measured on top of the ones before it.
 */
export function runCostComparison(plan: Plan): CostComparison {
  const c = compileChecked(plan)
  const path = manualPath(c)
  const run = (s: Switches) => withPhaseInfo(c, simulate(c, path, { switches: s }))
  const on = c.realism
  const allOff = run(ALL_OFF)
  const steps: CostStep[] = []
  const current: Switches = { ...ALL_OFF }
  let before = allOff.finalBalance
  let actual = allOff
  for (const key of ['fees', 'tax', 'inflation'] as const) {
    if (!on[key]) continue
    current[key] = true
    actual = run({ ...current })
    const after = current.inflation ? actual.finalReal : actual.finalBalance
    steps.push({ switch: key, after, cost: before - after })
    before = after
  }
  return { allOff, actual, steps }
}

/** Label like "2026–27" for a financial year ending in 2027. */
export function financialYearLabel(fy: number): string {
  return `${fy - 1}–${String(fy).slice(-2)}`
}

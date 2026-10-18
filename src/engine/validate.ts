// Checks a plan for problems that would stop it being calculated.

import { isValidISO, toDayNumber } from './dates'
import { phaseRanges } from './schedule'
import type { Brokerage, Plan, Varying } from './types'

export const MAX_PLAN_YEARS = 100

export interface PlanProblem {
  /** Which part of the plan, e.g. "plan", a phase id, or an event id. */
  where: string
  message: string
}

function numbersIn(v: Varying): number[] {
  if (v.kind === 'fixed') return [v.value]
  if (v.kind === 'ramp') return [v.from, v.to]
  return [v.from, v.stepBy]
}

function durationsOk(v: Varying): boolean {
  if (v.kind === 'fixed') return true
  const all = [v.startAfter, v.lasts, v.kind === 'steps' ? v.every : undefined]
  return all.every((d) => d === undefined || (Number.isInteger(d.count) && d.count >= (d === v.startAfter ? 0 : 1)))
}

export function validatePlan(plan: Plan): PlanProblem[] {
  const problems: PlanProblem[] = []
  const add = (where: string, message: string) => problems.push({ where, message })

  if (!isValidISO(plan.startDate)) add('plan', 'Pick a start date.')
  if (!Number.isFinite(plan.startingBalance) || plan.startingBalance < 0) add('plan', 'Starting balance can’t be negative.')
  if (plan.phases.length === 0) add('plan', 'Add at least one phase.')

  for (const phase of plan.phases) {
    const label = phase.name || 'A phase'
    if (!Number.isInteger(phase.duration.count) || phase.duration.count < 1) {
      add(phase.id, `${label}: length must be a whole number, 1 or more.`)
    }
    if (numbersIn(phase.deposit).some((n) => !Number.isFinite(n))) add(phase.id, `${label}: deposit needs a number.`)
    else if (phase.deposit.kind !== 'steps' && numbersIn(phase.deposit).some((n) => n < 0)) {
      add(phase.id, `${label}: deposits can’t be negative. Use a one-off event for withdrawals.`)
    } else if (phase.deposit.kind === 'steps' && phase.deposit.from < 0) {
      add(phase.id, `${label}: deposits can’t be negative. Use a one-off event for withdrawals.`)
    }
    if (numbersIn(phase.returnRate).some((n) => !Number.isFinite(n))) add(phase.id, `${label}: return rate needs a number.`)
    else if (phase.returnRate.kind !== 'steps' && numbersIn(phase.returnRate).some((n) => n <= -100)) {
      add(phase.id, `${label}: a return of −100% or lower would wipe out everything. Use a higher number.`)
    }
    if (!durationsOk(phase.deposit) || !durationsOk(phase.returnRate)) {
      add(phase.id, `${label}: change timings must be whole numbers.`)
    }
  }

  // Stage 4 settings (all optional).
  const pct = (n: number | undefined, lo = 0, hi = 100) => n === undefined || (Number.isFinite(n) && n >= lo && n <= hi)
  for (const phase of plan.phases) {
    const label = phase.name || 'A phase'
    if (!pct(phase.mer, 0, 10)) add(phase.id, `${label}: the management fee should be between 0% and 10% a year.`)
    if (!pct(phase.marginalRate)) add(phase.id, `${label}: the tax rate should be between 0% and 100%.`)
    if (phase.otherIncome !== undefined && !(Number.isFinite(phase.otherIncome) && phase.otherIncome >= 0)) add(phase.id, `${label}: other income can’t be negative.`)
    const d = phase.distribution
    if (d && !(pct(d.yield, 0, 50) && pct(d.frankedPct) && pct(d.foreignPct) && pct(d.foreignTaxPct, 0, 99))) {
      add(phase.id, `${label}: distribution percentages need to be between 0 and 100 (yield up to 50%).`)
    }
  }
  const r = plan.realism
  if (r?.feeSettings) {
    const f = r.feeSettings
    if (f.brokerage && !brokerageOk(f.brokerage)) add('plan', 'Fees: brokerage amounts can’t be negative.')
    if (!pct(f.fxFeePct, 0, 20) || !pct(f.spreadPct, 0, 20)) add('plan', 'Fees: currency and spread fees should be between 0% and 20%.')
    if (!pct(f.cashRate, -10, 100)) add('plan', 'Fees: the cash rate needs a sensible number.')
    if (f.platformFee !== undefined && !(Number.isFinite(f.platformFee) && f.platformFee >= 0)) add('plan', 'Fees: the platform fee can’t be negative.')
  }
  if (r?.taxSettings?.owner === 'minor' && r.taxSettings.turns18On !== undefined && !isValidISO(r.taxSettings.turns18On)) {
    add('plan', 'Tax: pick the date they turn 18.')
  }
  if (r?.inflationSettings) {
    const nums = numbersIn(r.inflationSettings.rate)
    if (nums.some((x) => !Number.isFinite(x))) add('plan', 'Inflation: the rate needs a number.')
    else if (r.inflationSettings.rate.kind !== 'steps' && nums.some((x) => x <= -99)) add('plan', 'Inflation: use a rate above −99%.')
    if (!durationsOk(r.inflationSettings.rate)) add('plan', 'Inflation: change timings must be whole numbers.')
  }

  for (const event of plan.events) {
    if (!isValidISO(event.date)) add(event.id, `${event.name || 'An event'}: pick a date.`)
    if (!Number.isFinite(event.amount)) add(event.id, `${event.name || 'An event'}: amount needs a number.`)
  }

  if (plan.goal) {
    if (!isValidISO(plan.goal.date)) add('goal', 'Goal: pick a date.')
    if (!Number.isFinite(plan.goal.amount) || plan.goal.amount <= 0) add('goal', 'Goal: amount must be more than $0.')
  }

  if (problems.length === 0 && plan.phases.length > 0) {
    const ranges = phaseRanges(plan)
    const totalDays = ranges[ranges.length - 1].end - toDayNumber(plan.startDate)
    if (totalDays > MAX_PLAN_YEARS * 366) add('plan', `Plans can be up to ${MAX_PLAN_YEARS} years long.`)
  }

  return problems
}

function brokerageOk(b: Brokerage): boolean {
  const ok = (n: number) => Number.isFinite(n) && n >= 0
  if (b.kind === 'flat') return ok(b.fee)
  if (b.kind === 'percent') return ok(b.pct) && ok(b.min)
  return b.tiers.length > 0 && b.tiers.every((t) => ok(t.fee) && ok(t.pct) && (t.upTo === null || ok(t.upTo)))
}

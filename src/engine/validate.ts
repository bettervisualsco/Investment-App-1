// Checks a plan for problems that would stop it being calculated.

import { isValidISO, toDayNumber } from './dates'
import { phaseRanges } from './schedule'
import type { Plan, Varying } from './types'

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

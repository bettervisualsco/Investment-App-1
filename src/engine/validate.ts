// Checks a plan for problems that would stop it being calculated.

import { isValidISO, toDayNumber } from './dates'
import { phaseRanges } from './schedule'
import type { Brokerage, Investment, Plan, PredictionSettings, Varying } from './types'

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
  // Stage 3: what each phase is invested in (optional).
  for (const phase of plan.phases) {
    const problem = investmentProblem(phase.investment)
    if (problem) add(phase.id, `${phase.name || 'A phase'}: ${problem}`)
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

/** What's wrong with a phase's investment choice, in words, or null if it's fine. */
export function investmentProblem(inv: Investment | undefined): string | null {
  if (!inv) return null
  const num = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
  switch (inv.kind) {
    case 'etf':
      return inv.etf ? null : 'pick an ETF.'
    case 'cash':
      return num(inv.rate) && inv.rate >= 0 && inv.rate <= 50 ? null : 'the savings rate should be between 0% and 50% a year.'
    case 'mix': {
      if (inv.parts.length === 0) return 'add at least one ETF to the mix.'
      if (inv.parts.some((p) => !p.etf || !num(p.weight) || p.weight < 0)) return 'each part of the mix needs an ETF and a share of 0% or more.'
      if (new Set(inv.parts.map((p) => p.etf)).size !== inv.parts.length) return 'each ETF can only be in the mix once.'
      const total = inv.parts.reduce((sum, p) => sum + p.weight, 0)
      return Math.abs(total - 100) < 0.01 ? null : `the mix adds up to ${Math.round(total * 100) / 100}%, but it needs to add up to 100%.`
    }
    case 'custom':
      if (!num(inv.mean) || inv.mean <= -50 || inv.mean > 50) return 'the average return should be between −50% and 50% a year.'
      if (!num(inv.volatility) || inv.volatility < 0 || inv.volatility > 100) return 'the volatility should be between 0% and 100%.'
      if (inv.crashes) {
        const { everyYears, drop } = inv.crashes
        if (!num(everyYears) || everyYears < 1 || everyYears > 1000) return 'crashes need to be at most once a year (1 year or more between them).'
        if (!num(drop) || drop <= 0 || drop >= 100) return 'a crash drop should be between 0% and 100%.'
      }
      return null
    default:
      return 'choose what it’s invested in.'
  }
}

export const MIN_RUNS = 500
export const MAX_RUNS = 10_000

/** Extra checks before Prediction mode can run (on top of validatePlan). */
export function predictionProblems(plan: Plan): PlanProblem[] {
  const problems: PlanProblem[] = []
  for (const phase of plan.phases) {
    if (!phase.investment) {
      problems.push({ where: phase.id, message: `${phase.name || 'A phase'}: choose what it’s invested in, so Prediction mode knows which history to replay.` })
    }
  }
  problems.push(...predictionSettingsProblems(plan.prediction))
  return problems
}

export function predictionSettingsProblems(s: PredictionSettings | undefined): PlanProblem[] {
  const problems: PlanProblem[] = []
  if (!s) return problems
  const add = (message: string) => problems.push({ where: 'prediction', message })
  if (s.runs !== undefined && !(Number.isInteger(s.runs) && s.runs >= MIN_RUNS && s.runs <= MAX_RUNS)) {
    add(`Simulations: use a whole number from ${MIN_RUNS.toLocaleString('en-AU')} to ${MAX_RUNS.toLocaleString('en-AU')}.`)
  }
  if (s.blockMonths !== undefined && !(Number.isInteger(s.blockMonths) && s.blockMonths >= 1 && s.blockMonths <= 120)) add('Block length: use a whole number of months from 1 to 120.')
  if (s.percentiles && !percentilesOk(s.percentiles)) add('Percentiles: worst must be below likely, and likely below best, all between 1 and 99.')
  if (s.window === 'custom') {
    const ok = (y: unknown) => typeof y === 'number' && Number.isInteger(y) && y >= 1800 && y <= 2200
    if (!ok(s.windowFrom) || !ok(s.windowTo) || s.windowFrom! > s.windowTo!) add('History: pick a first year that is before (or the same as) the last year.')
  }
  return problems
}

export function percentilesOk(p: readonly number[]): boolean {
  return p.length === 3 && p.every((x) => Number.isFinite(x) && x >= 1 && x <= 99) && p[0] < p[1] && p[1] < p[2]
}

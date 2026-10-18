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

import { daysInMonth, dayToISO, financialYearOf, fromDayNumber, toDayNumber } from './dates'
import { paymentDays, phaseRanges } from './schedule'
import type { Plan } from './types'
import { validatePlan } from './validate'
import { depositAmounts, valueByDay } from './varying'

export interface SeriesPoint {
  /** Day number. The values are as at the start of this day. */
  day: number
  balance: number // cents
  /** Starting balance + everything put in − everything taken out, so far. */
  netContributed: number // cents
}

export interface YearRow {
  /** Financial year, named by the year it ends (2027 = FY 2026–27). */
  fy: number
  /** First and last day of this year that are inside the plan. */
  firstDay: number
  lastDay: number
  opening: number
  deposits: number
  withdrawals: number
  growth: number
  closing: number
}

export interface PhaseSummary {
  phaseId: string
  start: number
  end: number // exclusive
  depositCount: number
  depositTotal: number // cents
  firstDeposit: number | null
  lastDeposit: number | null
}

export interface GoalResult {
  amount: number
  day: number
  balanceOnDay: number
  reached: boolean
  /** First day the balance was at or above the goal, if ever. */
  firstReachedDay: number | null
  /** Goal date falls outside the plan, so we checked the nearest end instead. */
  outsidePlan: boolean
}

export interface ManualResult {
  startDay: number
  endDay: number // exclusive: first day after the plan
  finalBalance: number
  startingBalance: number
  totalDeposited: number // regular deposits + money-in events
  totalWithdrawn: number
  totalGrowth: number
  netContributed: number
  series: SeriesPoint[]
  years: YearRow[]
  phases: PhaseSummary[]
  goal: GoalResult | null
  warnings: string[]
}

export function runManual(plan: Plan): ManualResult {
  const problems = validatePlan(plan)
  if (problems.length > 0) throw new Error(problems.map((p) => p.message).join(' '))

  const warnings: string[] = []
  const ranges = phaseRanges(plan)
  const startDay = toDayNumber(plan.startDate)
  const endDay = ranges[ranges.length - 1].end

  // Regular deposits, by day.
  const depositOn = new Map<number, number>()
  const phases: PhaseSummary[] = plan.phases.map((phase, i) => {
    const { start, end } = ranges[i]
    const days = paymentDays(start, end, phase.depositFrequency)
    const amounts = depositAmounts(phase.deposit, start, end, days)
    days.forEach((d, j) => depositOn.set(d, (depositOn.get(d) ?? 0) + amounts[j]))
    return {
      phaseId: phase.id,
      start,
      end,
      depositCount: days.length,
      depositTotal: amounts.reduce((a, b) => a + b, 0),
      firstDeposit: amounts.length ? amounts[0] : null,
      lastDeposit: amounts.length ? amounts[amounts.length - 1] : null,
    }
  })

  // One-off events, by day.
  const eventsOn = new Map<number, { name: string; amount: number }[]>()
  for (const event of plan.events) {
    const day = toDayNumber(event.date)
    if (day < startDay || day >= endDay) {
      warnings.push(`“${event.name || 'Event'}” on ${event.date} is outside the plan’s dates, so it was left out.`)
      continue
    }
    const list = eventsOn.get(day) ?? []
    list.push({ name: event.name, amount: Math.round(event.amount) })
    eventsOn.set(day, list)
  }

  // Return rate for each phase, as a fast day → % function.
  const rateFns = plan.phases.map((phase, i) => valueByDay(phase.returnRate, ranges[i].start, ranges[i].end))

  const goalDay = plan.goal ? toDayNumber(plan.goal.date) : null
  const goalCheckDay = goalDay === null ? null : Math.min(Math.max(goalDay, startDay), endDay - 1)
  let goalBalance = 0
  let firstReachedDay: number | null = null

  const totalDays = endDay - startDay
  const sampleEvery = Math.max(1, Math.ceil(totalDays / 720))

  let balance = plan.startingBalance
  let totalDeposited = 0
  let totalWithdrawn = 0
  let totalGrowth = 0
  let rateClampWarned = false

  const series: SeriesPoint[] = [{ day: startDay, balance, netContributed: plan.startingBalance }]
  const years: YearRow[] = []
  let year: YearRow | null = null

  let phaseIndex = 0
  for (let day = startDay; day < endDay; day++) {
    while (day >= ranges[phaseIndex].end) phaseIndex++

    const fy = financialYearOf(day)
    if (!year || year.fy !== fy) {
      year = { fy, firstDay: day, lastDay: day, opening: balance, deposits: 0, withdrawals: 0, growth: 0, closing: balance }
      years.push(year)
    }

    // 1. Money in and out at the start of the day.
    const deposit = depositOn.get(day) ?? 0
    balance += deposit
    totalDeposited += deposit
    year.deposits += deposit

    for (const event of eventsOn.get(day) ?? []) {
      if (event.amount >= 0) {
        balance += event.amount
        totalDeposited += event.amount
        year.deposits += event.amount
      } else {
        const wanted = -event.amount
        const taken = Math.min(wanted, balance)
        if (taken < wanted) {
          warnings.push(
            `“${event.name || 'Withdrawal'}” on ${dayToISO(day)} wanted $${(wanted / 100).toFixed(2)} but only $${(taken / 100).toFixed(2)} was there, so the balance went to $0.`,
          )
        }
        balance -= taken
        totalWithdrawn += taken
        year.withdrawals += taken
      }
    }

    // 2. One day of growth. Each month is 1/12 of a year, spread over its days.
    let rate = rateFns[phaseIndex](day) / 100
    if (rate <= -0.9999) {
      rate = -0.9999
      if (!rateClampWarned) {
        warnings.push('A return rate reached −100% or lower, so it was treated as −99.99%.')
        rateClampWarned = true
      }
    }
    if (rate !== 0 && balance !== 0) {
      const { y, m } = fromDayNumber(day)
      const factor = Math.pow(1 + rate, 1 / (12 * daysInMonth(y, m)))
      const growth = balance * (factor - 1)
      balance += growth
      totalGrowth += growth
      year.growth += growth
    }

    year.lastDay = day
    year.closing = balance

    if (balance >= (plan.goal?.amount ?? Infinity) && firstReachedDay === null) firstReachedDay = day
    if (day === goalCheckDay) goalBalance = balance

    const isLast = day === endDay - 1
    if (isLast || (day - startDay + 1) % sampleEvery === 0) {
      series.push({ day: day + 1, balance, netContributed: plan.startingBalance + totalDeposited - totalWithdrawn })
    }
  }

  let goal: GoalResult | null = null
  if (plan.goal && goalDay !== null && goalCheckDay !== null) {
    goal = {
      amount: plan.goal.amount,
      day: goalCheckDay,
      balanceOnDay: goalBalance,
      reached: goalBalance >= plan.goal.amount,
      firstReachedDay,
      outsidePlan: goalDay !== goalCheckDay,
    }
  }

  return {
    startDay,
    endDay,
    finalBalance: balance,
    startingBalance: plan.startingBalance,
    totalDeposited,
    totalWithdrawn,
    totalGrowth,
    netContributed: plan.startingBalance + totalDeposited - totalWithdrawn,
    series,
    years,
    phases,
    goal,
    warnings,
  }
}

/** Label like "2026–27" for a financial year ending in 2027. */
export function financialYearLabel(fy: number): string {
  return `${fy - 1}–${String(fy).slice(-2)}`
}

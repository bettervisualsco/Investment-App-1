// Turns a plan into a day-by-day timetable, worked out once. The simulation
// (simulate.ts) then just walks through these arrays, so running the same plan
// thousands of times (Prediction mode) stays fast.
//
// Days are counted from the plan's start: t = 0 is the start date.

import { addMonths, daysInMonth, fromDayNumber, toDayNumber } from './dates'
import { resolveRealism, type ResolvedRealism } from './defaults'
import { paymentDays, phaseRanges, type PhaseRange } from './schedule'
import type { DistributionFrequency, Plan } from './types'
import { depositAmounts } from './varying'

export interface FyInfo {
  /** Financial year, named by the year it ends. */
  fy: number
  firstT: number
  lastT: number
  /** Days of this financial year inside the plan ÷ days in the whole financial year. */
  share: number
  /** Your other taxable income for the year, cents (each phase's yearly income, weighted by its days in the year). */
  otherIncome: number
  /** Marginal rate for the year, % (weighted the same way). */
  marginalRate: number
  /** Under-18 rules apply this year. */
  minor: boolean
}

export interface CompiledEvent {
  name: string
  amount: number // cents
}

export interface CompiledPlan {
  plan: Plan
  realism: ResolvedRealism
  startDay: number
  endDay: number // exclusive
  n: number // number of days
  ranges: PhaseRange[]
  /** Which phase each day is in. */
  phaseOf: Uint16Array
  /** Days in each day's calendar month. */
  dim: Uint8Array
  /** On the plan's last day in each calendar month: how much of that month is inside the plan (1 = all of it). 0 on other days. */
  monthEndShare: Float64Array
  /** Index into `fys` for each day. */
  fyOf: Uint16Array
  fys: FyInfo[]
  /** Regular deposit landing on each day, cents (before any growth with inflation). */
  deposit: Float64Array
  /** 1 on the days a regular deposit is due (even if the amount is $0). */
  depositDay: Uint8Array
  /** One-off events by day. */
  events: Map<number, CompiledEvent[]>
  /** Days when waiting cash is invested (Fees on). */
  buyDay: Uint8Array
  /** Days when distributions are paid (Tax on). */
  payoutDay: Uint8Array
  /** For a purchase on day t: the first day it can be sold with the 50% CGT discount (held at least 12 months). */
  discountFrom: Int32Array
  depositCount: number[]
  warnings: string[]
}

const payoutMonths: Record<DistributionFrequency, number[]> = {
  monthly: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  quarterly: [3, 6, 9, 12],
  halfYearly: [6, 12],
  yearly: [6],
}

export function compilePlan(plan: Plan): CompiledPlan {
  const realism = resolveRealism(plan)
  const ranges = phaseRanges(plan)
  const startDay = toDayNumber(plan.startDate)
  const endDay = ranges[ranges.length - 1].end
  const n = endDay - startDay
  const warnings: string[] = []

  const phaseOf = new Uint16Array(n)
  ranges.forEach((r, i) => phaseOf.fill(i, r.start - startDay, r.end - startDay))

  // Calendar: month lengths, month ends, financial years.
  const dim = new Uint8Array(n)
  const monthEndShare = new Float64Array(n)
  const fyOf = new Uint16Array(n)
  const discountFrom = new Int32Array(n)
  const fys: FyInfo[] = []
  let t = 0
  while (t < n) {
    const { y, m, d } = fromDayNumber(startDay + t)
    const len = daysInMonth(y, m)
    const daysLeftInMonth = len - d + 1
    const last = Math.min(n, t + daysLeftInMonth) - 1
    const fy = m >= 7 ? y + 1 : y
    if (fys.length === 0 || fys[fys.length - 1].fy !== fy) {
      fys.push({ fy, firstT: t, lastT: t, share: 0, otherIncome: 0, marginalRate: 0, minor: false })
    }
    const fyIndex = fys.length - 1
    for (let k = t; k <= last; k++) {
      dim[k] = len
      fyOf[k] = fyIndex
      // Held "at least 12 months": the day of buying and the day of selling don't count, so the
      // discount starts the day after the 12-month anniversary.
      discountFrom[k] = toDayNumber(addMonths({ y, m, d: d + (k - t) }, 12)) + 1 - startDay
    }
    fys[fyIndex].lastT = last
    monthEndShare[last] = (last - t + 1) / len
    t = last + 1
  }

  // Per financial year: share of the year in the plan, other income, marginal rate, under-18.
  const tax = realism.taxSettings
  const birthday18 = tax.owner === 'minor' && tax.turns18On ? toDayNumber(tax.turns18On) : null
  for (const info of fys) {
    const fyLength = toDayNumber({ y: info.fy, m: 7, d: 1 }) - toDayNumber({ y: info.fy - 1, m: 7, d: 1 })
    const planDays = info.lastT - info.firstT + 1
    info.share = planDays / fyLength
    let income = 0
    let rate = 0
    for (let i = 0; i < ranges.length; i++) {
      const from = Math.max(ranges[i].start - startDay, info.firstT)
      const to = Math.min(ranges[i].end - startDay - 1, info.lastT)
      if (to < from) continue
      const w = (to - from + 1) / planDays
      income += w * realism.phases[i].otherIncome
      rate += w * realism.phases[i].marginalRate
    }
    info.otherIncome = income
    info.marginalRate = rate
    // Under 18 on the last day of the financial year (30 June).
    const fyLastDay = toDayNumber({ y: info.fy, m: 6, d: 30 })
    info.minor = tax.owner === 'minor' && (birthday18 === null || birthday18 > fyLastDay)
  }

  // Regular deposits.
  const deposit = new Float64Array(n)
  const depositDay = new Uint8Array(n)
  const depositCount: number[] = []
  plan.phases.forEach((phase, i) => {
    const { start, end } = ranges[i]
    const days = paymentDays(start, end, phase.depositFrequency)
    const amounts = depositAmounts(phase.deposit, start, end, days)
    days.forEach((d, j) => {
      deposit[d - startDay] += amounts[j]
      depositDay[d - startDay] = 1
    })
    depositCount.push(days.length)
  })

  // One-off events.
  const events = new Map<number, CompiledEvent[]>()
  for (const event of plan.events) {
    const day = toDayNumber(event.date)
    if (day < startDay || day >= endDay) {
      warnings.push(`“${event.name || 'Event'}” on ${event.date} is outside the plan’s dates, so it was left out.`)
      continue
    }
    const list = events.get(day - startDay) ?? []
    list.push({ name: event.name, amount: Math.round(event.amount) })
    events.set(day - startDay, list)
  }

  // When waiting cash is invested.
  const buyDay = new Uint8Array(n)
  const freq = realism.feeSettings.buyFrequency
  if (freq === 'eachDeposit') buyDay.fill(1)
  else for (const d of paymentDays(startDay, endDay, freq)) buyDay[d - startDay] = 1

  // When distributions are paid: the last day of the payout months for the phase you're in, and the plan's last day.
  const payoutDay = new Uint8Array(n)
  for (let k = 0; k < n; k++) {
    if (monthEndShare[k] === 0) continue
    const { m, d } = fromDayNumber(startDay + k)
    const isCalendarMonthEnd = d === dim[k]
    const months = payoutMonths[realism.phases[phaseOf[k]].distribution.frequency]
    if (isCalendarMonthEnd && months.includes(m)) payoutDay[k] = 1
  }
  if (n > 0) payoutDay[n - 1] = 1

  return {
    plan,
    realism,
    startDay,
    endDay,
    n,
    ranges,
    phaseOf,
    dim,
    monthEndShare,
    fyOf,
    fys,
    deposit,
    depositDay,
    events,
    buyDay,
    payoutDay,
    discountFrom,
    depositCount,
    warnings,
  }
}

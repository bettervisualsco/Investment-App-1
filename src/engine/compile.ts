// Turns a plan into a day-by-day timetable, worked out once. The simulation
// (simulate.ts) then just walks through these arrays, so running the same plan
// thousands of times (Prediction mode) stays fast.
//
// Days are counted from the plan's start: t = 0 is the start date.

import { addMonths, daysInMonth, fromDayNumber, parseISO, toDayNumber } from './dates'
import { resolveHoldingSettings, resolveRealism, type ResolvedHolding, type ResolvedRealism } from './defaults'
import { DEFAULT_HOLDING_RETURN, holdingHandling, isSeparate, startingHoldings, startingTotal } from './holdings'
import { dailyFactor } from './path'
import { paymentDays, phaseRanges, type PhaseRange } from './schedule'
import { CGT_REFORM } from './taxTables'
import type { DistributionFrequency, Investment, Plan } from './types'
import { depositAmounts, valueByDay } from './varying'

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
  /**
   * Price level (1 = the plan's start) on this year's 1 July, when that is before the plan starts (a plan starting
   * mid-year), worked out at the first inflation rate. Null when 1 July is inside the plan (the simulation knows it).
   */
  julyCpi: number | null
}

export interface CompiledEvent {
  name: string
  amount: number // cents
}

/** Something you own at the start of the plan, ready for the simulation (see holdings.ts). */
export interface CompiledHolding {
  id: string
  name: string
  /** Today's value, cents. */
  value: number
  /** What it's in. Undefined = the plan's own investment. */
  investment: Investment | undefined
  /**
   * Where it goes on day one:
   * - "plan": part of the plan's own investment (the first phase's), keeping its cost base and purchase date.
   * - "keep": kept as a separate holding for the whole plan, with its own returns, fee and distributions.
   * - "move": sold on the start date and the money put into the first phase's investment.
   */
  role: 'plan' | 'keep' | 'move'
  /** Bought on the start date for its value: invested exactly like the starting balance always was. */
  plain: boolean
  /** Its own fee and distributions (used when kept or moved). */
  settings: ResolvedHolding
  /** Manual mode: its return, % a year (kept holdings). */
  manualRate: number
  /** Its tax lot: cost base (cents), the first day it can be sold with the 12-month discount, the price level when the cost base was set, and any gain up to 30 June 2027 (when that's before the plan starts). */
  lotCost: number
  lotFrom: number
  lotCpi: number
  lotPre: number
  /** Kept holdings: the days its distributions are paid (its own frequency, plus the plan's last day). */
  payoutDay: Uint8Array | null
}

export interface CompiledPlan {
  plan: Plan
  /** The starting balance (plan.startingBalance, or the total of the holdings). */
  startingBalance: number
  /** The money you have now, oldest purchase first. */
  holdings: CompiledHolding[]
  /** The holdings kept separately, in the order of MarketPath.sleeves. */
  kept: CompiledHolding[]
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
  /**
   * "Brackets rise with inflation" measures prices from 1 July of the latest tax year we have (1 July 2027).
   * If that's before the plan starts: the price level then (1 = the plan's start), at the first inflation rate.
   * Null when it's inside the plan.
   */
  bracketBaseCpi: number | null
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
      fys.push({ fy, firstT: t, lastT: t, share: 0, otherIncome: 0, marginalRate: 0, minor: false, julyCpi: null })
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

  // Prices before the plan starts (for "brackets rise with inflation"): the first inflation rate, run backwards.
  const firstInflation = Math.max(-99, valueByDay(realism.inflationSettings.rate, startDay, endDay)(startDay))
  const cpiBeforeStart = (day: number) => {
    // Same as multiplying each day's factor, a month at a time.
    let growth = 1
    for (let d = day; d < startDay; ) {
      const { y, m, d: dom } = fromDayNumber(d)
      const len = daysInMonth(y, m)
      const stop = Math.min(d + len - dom + 1, startDay)
      growth *= Math.pow(dailyFactor(firstInflation, len), stop - d)
      d = stop
    }
    return 1 / growth
  }
  if (fys.length > 0) {
    const firstJuly = toDayNumber({ y: fys[0].fy - 1, m: 7, d: 1 })
    if (firstJuly < startDay) fys[0].julyCpi = cpiBeforeStart(firstJuly)
  }
  const baseJuly = toDayNumber({ y: realism.taxYears[realism.taxYears.length - 1].fy - 1, m: 7, d: 1 })
  const bracketBaseCpi = baseJuly <= startDay ? cpiBeforeStart(baseJuly) : null

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

  // Money you have now.
  const reformDay = realism.taxSettings.cgtRules === 'law' ? toDayNumber(CGT_REFORM.startDate) : Infinity
  const handling = holdingHandling(plan)
  const holdings: CompiledHolding[] = []
  for (const h of startingHoldings(plan)) {
    if (!(h.value > 0)) continue
    const label = h.name || (h.investment?.kind === 'etf' ? h.investment.etf : 'A holding')
    const bought = h.boughtOn ? toDayNumber(h.boughtOn) : startDay
    const cost = h.costBase ?? h.value
    const role = isSeparate(plan, h) ? handling : 'plan'
    const ymd = h.boughtOn ? parseISO(h.boughtOn) : fromDayNumber(startDay)
    let lotCost = cost
    let lotCpi = 1
    let lotPre = 0
    if (bought < startDay && bought >= reformDay) lotCpi = cpiBeforeStart(bought)
    else if (bought < reformDay && reformDay < startDay) {
      // Bought before 1 July 2027, but the plan starts after it: the gain up to 30 June 2027 needs its value then,
      // estimated as steady growth from what you paid to today's value.
      const share = (reformDay - bought) / (startDay - bought)
      const atReform = cost > 0 && h.value > 0 ? cost * Math.pow(h.value / cost, share) : cost + (h.value - cost) * share
      lotPre = atReform - cost
      lotCost = atReform
      lotCpi = cpiBeforeStart(reformDay)
      warnings.push(`${label}: bought before 1 July 2027, when the capital gains tax rules changed. Its value on 30 June 2027 was estimated as steady growth from what you paid to today’s value.`)
    }
    const settings = resolveHoldingSettings(h)
    let holdingPayout: Uint8Array | null = null
    if (role === 'keep') {
      holdingPayout = new Uint8Array(n)
      const months = payoutMonths[settings.distribution.frequency]
      for (let k = 0; k < n; k++) {
        if (monthEndShare[k] === 0) continue
        const { m, d } = fromDayNumber(startDay + k)
        if (d === dim[k] && months.includes(m)) holdingPayout[k] = 1
      }
      if (n > 0) holdingPayout[n - 1] = 1
    }
    holdings.push({
      id: h.id,
      name: label,
      value: h.value,
      investment: h.investment,
      role,
      plain: h.costBase === undefined && (h.boughtOn === undefined || bought === startDay),
      settings,
      manualRate: h.investment?.kind === 'cash' ? h.investment.rate : (h.returnRate ?? DEFAULT_HOLDING_RETURN),
      lotCost,
      lotFrom: toDayNumber(addMonths(ymd, 12)) + 1 - startDay,
      lotCpi,
      lotPre,
      payoutDay: holdingPayout,
    })
  }
  // Oldest purchase first, so sales use the oldest lots first.
  holdings.sort((a, b) => a.lotFrom - b.lotFrom)

  return {
    plan,
    startingBalance: startingTotal(plan),
    holdings,
    kept: holdings.filter((h) => h.role === 'keep'),
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
    bracketBaseCpi,
    depositCount,
    warnings,
  }
}

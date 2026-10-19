// The day-by-day simulation, with the Fees, Tax and Inflation switches.
//
// It is given a compiled plan (compile.ts) and a MarketPath (path.ts) with the
// returns and inflation for each day, so the same code runs Manual mode (one
// path from your typed rates) and Prediction mode (one path per simulated
// history). Fees and tax are applied here, identically in both modes.
//
// Each day, in order:
//   1. Deposits and one-off events land (start of the day). Withdrawals are paid.
//   2. Fees on: waiting cash is invested if it's a buying day (brokerage etc.).
//   3. One day of growth. Waiting cash earns the cash rate.
//   4. Last day of a month: the management fee (MER) and a monthly platform fee come off.
//      The MER builds up day by day at the rate of the phase you're in that day, so a
//      phase that starts mid-month pays its own fee for its own days.
//   5. Tax on: distributions are paid on their payout days and taxed.
//   6. Last day of a financial year (30 June) or of the plan: a yearly platform
//      fee, the end-of-plan sale (if chosen), and the year's tax is settled.
//
// How the investment is tracked: you hold `units`, each worth `price` cents,
// plus `accrued`: distribution income built up inside the fund since the last
// payout (it counts as part of your balance, like a real fund's unit price).
// With Tax on, the franked part, the foreign part and the foreign tax of that
// income are tracked as it builds up, using each day's phase, so a payout after
// a phase change uses each phase's settings for its own days.
// With Tax on, every purchase is kept as its own lot (units, cost base, date)
// for capital gains tax. Sales use the oldest lots first.
//
// Money you have now (holdings.ts): holdings in the plan's own investment are
// lots with their real cost base and purchase date. Holdings kept separately
// are their own "sleeves", tracked the same way but with their own returns
// (MarketPath.sleeves), fee and distributions. Deposits and buys go into the
// plan's investment. Withdrawals, tax and platform fees that need a sale take
// from every investment in proportion to its value (pro-rata).
//
// Tax is estimated per Australian financial year. Each time something taxable
// happens (a distribution, a sale), the year's tax is re-worked from the year's
// running totals and only the difference is charged, so by 30 June the year's
// total is exactly the tax on the whole year's income.

import type { CompiledHolding, CompiledPlan } from './compile'
import type { ResolvedHolding } from './defaults'
import { brokerageFor, grossForNet, saleCosts } from './fees'
import type { MarketPath } from './path'
import { emptyYearIncome, frankingCredit, tableFor, yearTax, type TaxYearContext, type YearIncome } from './tax'
import { dayToISO, toDayNumber } from './dates'
import { CGT_REFORM, WORKING_OFFSET } from './taxTables'

export interface Switches {
  fees: boolean
  tax: boolean
  inflation: boolean
}

export const ALL_OFF: Switches = { fees: false, tax: false, inflation: false }

export interface SimOptions {
  /** Which switches are on. Default: the plan's own switches. */
  switches?: Switches
  /** Keep the chart points and goal details (Manual mode). Prediction mode can turn this off to save memory. Default true. */
  detail?: boolean
}

export interface SeriesPoint {
  /** Day number. The values are as at the start of this day. */
  day: number
  balance: number // cents
  /** Starting balance + everything put in − everything taken out, so far. */
  netContributed: number // cents
  /** Price level compared with the plan's start (1 = start). Divide by this for today's dollars. */
  cpi: number
  /** netContributed in today's dollars: each amount counted at the prices of the day it went in or out. */
  realNet: number
}

/** A year's numbers in today's dollars: each amount at the prices of the day it happened. Growth is what's left over, so it includes the loss to inflation. */
export interface RealYear {
  opening: number
  deposits: number
  withdrawals: number
  growth: number
  fees: number
  tax: number
  paidOut: number
  closing: number
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
  /** Investment growth (before fees and tax), plus interest on waiting cash. */
  growth: number
  fees: number
  /** Tax paid (negative = refund). */
  tax: number
  /** Distributions taken as cash (they leave the investment). */
  paidOut: number
  closing: number
  /** Price level at the end of the year compared with the plan's start. */
  cpiClosing: number
  real: RealYear
}

/** Totals in today's dollars (each amount at the prices of the day it happened). */
export interface RealTotals {
  deposited: number
  withdrawn: number
  fees: number
  tax: number
  paidOut: number
  netContributed: number
  /** Growth after inflation: finalReal minus everything else. */
  growth: number
}

export interface FeeTotals {
  mer: number
  brokerage: number
  currency: number
  spread: number
  platform: number
  total: number
}

export interface TaxTotals {
  /** Net tax paid (after franking credits and the foreign income tax offset). */
  total: number
  distributionsReceived: number
  frankingCredits: number
  foreignTaxOffset: number
  interest: number
  netCapitalGains: number
  /** Tax that couldn't be taken because the balance had run out. */
  unpaid: number
}

/** What happens at the end of the plan (Tax on). */
export interface EndSale {
  mode: 'sell' | 'hold'
  /** Value of the investments just before the (real or imagined) sale. */
  marketValue: number
  /** Brokerage, spread and currency fees on that sale. */
  costs: number
  /** Capital gains tax (and anything else) the sale adds to the last year's tax. */
  tax: number
  /** What you'd have in cash after selling and paying the tax. */
  afterTax: number
}

export interface PhaseDeposits {
  depositCount: number
  depositTotal: number
  firstDeposit: number | null
  lastDeposit: number | null
}

export interface GoalCheck {
  amount: number
  day: number
  balanceOnDay: number
  reached: boolean
  firstReachedDay: number | null
  outsidePlan: boolean
  /** The goal was checked in today's dollars (Inflation on). */
  inTodaysDollars: boolean
}

export interface SimResult {
  switches: Switches
  startDay: number
  endDay: number
  /** Balance at the end. With "sell everything at the end", this is the cash after selling and paying tax. */
  finalBalance: number
  /** finalBalance in today's dollars (start-of-plan prices). */
  finalReal: number
  cpiEnd: number
  startingBalance: number
  totalDeposited: number
  totalWithdrawn: number
  totalGrowth: number
  netContributed: number
  /** Distributions taken as cash. */
  totalPaidOut: number
  fees: FeeTotals
  tax: TaxTotals
  real: RealTotals
  endSale: EndSale | null
  /** Balance at each chart point (always kept). */
  balances: Float64Array
  /** Price level (CPI, 1 = start) at each chart point, so balances can be shown in today's dollars. */
  cpis: Float64Array
  series: SeriesPoint[]
  years: YearRow[]
  phases: PhaseDeposits[]
  goal: GoalCheck | null
  warnings: string[]
  /**
   * Only with holdings kept separately (and detail on): what each invested dollar is worth across all your investments,
   * before fees, at the start (index 0) and each month end. Used for the biggest drop in Prediction mode.
   */
  portfolioIndex?: Float64Array
}

/** One investment you hold: the plan's own (it follows each day's phase), or a holding kept separately. */
interface Sleeve {
  /** Cents per unit; units start as whole cents. */
  price: number
  units: number
  /** Distribution income built up since the last payout (part of the balance). */
  accrued: number
  /** Tax on: how much of `accrued` is franked, and the foreign tax already taken from its foreign part. */
  accFranked: number
  accForeignTax: number
  /** Fees on: the management fee built up so far this month (sum of each day's yearly MER %). */
  merDays: number
  /** Purchase lots (Tax on only), oldest first. `head` is the oldest lot still held. */
  lotUnits: number[]
  lotCost: number[]
  lotFrom: number[]
  /** Price level when the cost base was set (for cost base indexation). */
  lotCpi: number[]
  /** Gain (or loss) up to 30 June 2027, kept for when the lot is sold. */
  lotPre: number[]
  head: number
  /** A holding kept separately: its own fee and distributions. Null = the plan's own investment (each day's phase). */
  own: ResolvedHolding | null
  /** A holding kept separately: its own daily growth and income factors, its distribution accrual factors by month length 28–31, and its payout days. */
  growth: Float64Array | null
  income: Float64Array | null
  incomeFactor: Float64Array | null
  payoutDay: Uint8Array | null
  /**
   * A holding kept separately grows lazily, for speed: the growth and income factors since it was last brought up to
   * date. Its value is (units × price + accrued) × pendingGrowth; anything that touches it brings it up to date first
   * (see bringUpToDate in simulate). Always 1 for the plan's own investment.
   */
  pendingGrowth: number
  pendingIncome: number
}

function newSleeve(own: ResolvedHolding | null): Sleeve {
  return {
    price: 1,
    units: 0,
    accrued: 0,
    accFranked: 0,
    accForeignTax: 0,
    merDays: 0,
    lotUnits: [],
    lotCost: [],
    lotFrom: [],
    lotCpi: [],
    lotPre: [],
    head: 0,
    own,
    growth: null,
    income: null,
    incomeFactor: null,
    payoutDay: null,
    pendingGrowth: 1,
    pendingIncome: 1,
  }
}

/** What an investment is worth now, cents (including growth not yet brought up to date). */
const valueOf = (s: Sleeve) => (s.units * s.price + s.accrued) * s.pendingGrowth

export function simulate(c: CompiledPlan, path: MarketPath, opts: SimOptions = {}): SimResult {
  const r = c.realism
  const sw = opts.switches ?? { fees: r.fees, tax: r.tax, inflation: r.inflation }
  const detail = opts.detail ?? true
  const feesOn = sw.fees
  const taxOn = sw.tax
  const inflOn = sw.inflation
  const fs = r.feeSettings
  const ts = r.taxSettings
  const ph = r.phases
  const plan = c.plan
  const n = c.n
  const start = c.startingBalance
  const warnings: string[] = [...c.warnings, ...path.warnings]
  const warnOnce = new Set<string>()
  const warn = (key: string, text: string) => {
    if (warnOnce.has(key)) return
    warnOnce.add(key)
    warnings.push(text)
  }

  // ---- Holdings -----------------------------------------------------------
  // The plan's own investment, plus any holdings kept separately (each with its own returns, fee and distributions).
  const main = newSleeve(null)
  const sleeves: Sleeve[] = [main]
  if (c.kept.length > 0) {
    if (!path.sleeves || path.sleeves.length !== c.kept.length) throw new Error('The market path is missing the returns of a holding kept separately.')
    c.kept.forEach((h, i) => {
      const s = newSleeve(h.settings)
      s.growth = path.sleeves![i].growth
      s.income = path.sleeves![i].income ?? null
      s.payoutDay = h.payoutDay
      s.incomeFactor = Float64Array.from([28, 29, 30, 31], (d) => Math.pow(1 + h.settings.distribution.yield / 100, 1 / (12 * d)))
      sleeves.push(s)
    })
  }
  let cash = 0
  // First day of the 1 July 2027 capital gains rules (Infinity = old rules for ever).
  const reformT = ts.cgtRules === 'law' ? toDayNumber(CGT_REFORM.startDate) - c.startDay : Infinity

  // ---- Totals -------------------------------------------------------------
  const fees: FeeTotals = { mer: 0, brokerage: 0, currency: 0, spread: 0, platform: 0, total: 0 }
  const tax: TaxTotals = { total: 0, distributionsReceived: 0, frankingCredits: 0, foreignTaxOffset: 0, interest: 0, netCapitalGains: 0, unpaid: 0 }
  let totalDeposited = 0
  let totalWithdrawn = 0
  let totalGrowth = 0
  let totalPaidOut = 0
  let endSale: EndSale | null = null
  let cpi = 1
  const real = { deposited: 0, withdrawn: 0, fees: 0, tax: 0, paidOut: 0 }

  const phases: PhaseDeposits[] = c.depositCount.map((count) => ({ depositCount: count, depositTotal: 0, firstDeposit: null, lastDeposit: null }))
  const phaseStartCpi = new Float64Array(plan.phases.length).fill(1)

  // Daily factors that only depend on the month length: cache them.
  const incomeFactor = new Float64Array(plan.phases.length * 4) // distribution accrual, by phase and month length 28–31
  for (let p = 0; p < plan.phases.length; p++) {
    for (let d = 28; d <= 31; d++) incomeFactor[p * 4 + d - 28] = Math.pow(1 + ph[p].distribution.yield / 100, 1 / (12 * d))
  }
  const cashFactor = [28, 29, 30, 31].map((d) => Math.pow(1 + fs.cashRate / 100, 1 / (12 * d)))

  // ---- Year-by-year -------------------------------------------------------
  const years: YearRow[] = []
  let year: YearRow = null as unknown as YearRow
  let fyIndex = -1
  let ctx: TaxYearContext = null as unknown as TaxYearContext
  let income: YearIncome = emptyYearIncome()
  let charged = 0 // tax charged so far this financial year
  let carriedLosses = 0
  const cpiAtFyStart: number[] = []
  const latestTableFy = r.taxYears[r.taxYears.length - 1].fy

  // ---- Chart points and goal ---------------------------------------------
  const sampleEvery = Math.max(1, Math.ceil(n / 720))
  const balances = new Float64Array(Math.ceil(n / sampleEvery) + 2)
  const cpis = new Float64Array(balances.length)
  let sampleCount = 0
  const series: SeriesPoint[] = []
  const goalDayRaw = plan.goal ? toDayNumber(plan.goal.date) : null
  const goalCheckT = goalDayRaw === null ? -1 : Math.min(Math.max(goalDayRaw, c.startDay), c.endDay - 1) - c.startDay
  let goalBalance = 0
  let firstReachedT = -1
  // With holdings kept separately (detail runs): what each invested dollar is worth across all of them, before fees, at month ends.
  const trackIndex = detail && sleeves.length > 1
  const portfolioIndex: number[] = [1]
  let indexNow = 1

  const holdings = () => {
    let h = main.units * main.price + main.accrued
    for (let i = 1; i < sleeves.length; i++) h += valueOf(sleeves[i])
    return h
  }
  /** The fee and distribution settings of a sleeve on day t: its own, or the phase's. */
  const settingsOf = (s: Sleeve, t: number): ResolvedHolding => s.own ?? ph[c.phaseOf[t]]
  /** Buying and selling on day t pays trading costs (Fees on, and not a cash/savings account). */
  const costsOn = (s: Sleeve, t: number) => feesOn && settingsOf(s, t).tradingCosts

  /**
   * A holding kept separately: applies the growth since it was last brought up to date. Over days with nothing else
   * happening, the day-by-day steps below multiply out exactly: the value grows by the product of the growth factors,
   * the unit price by growth ÷ income, and the income built up (with its franked part and foreign tax) by what's left.
   */
  const bringUpToDate = (s: Sleeve) => {
    const g = s.pendingGrowth
    const h = s.pendingIncome
    if (g === 1 && h === 1) return
    s.pendingGrowth = s.pendingIncome = 1
    const before = s.units * s.price + s.accrued
    const after = before * g
    const grown = s.accrued * g
    s.price = (s.price * g) / h
    s.accrued = after - s.units * s.price
    if (taxOn) {
      const dist = s.own!.distribution
      const earned = s.accrued - grown
      const foreign = (earned * dist.foreignPct) / 100
      s.accFranked = s.accFranked * g + (earned * dist.frankedPct) / 100
      s.accForeignTax = s.accForeignTax * g + (dist.foreignTaxPct < 100 ? (foreign * dist.foreignTaxPct) / (100 - dist.foreignTaxPct) : 0)
    }
    const growth = after - before
    totalGrowth += growth
    year.growth += growth
  }
  const bringAllUpToDate = () => {
    for (let i = 1; i < sleeves.length; i++) bringUpToDate(sleeves[i])
  }

  // ---- Buying and selling -------------------------------------------------

  const addLot = (s: Sleeve, u: number, cost: number, from: number, lotCpi: number, pre: number) => {
    s.lotUnits.push(u)
    s.lotCost.push(cost)
    s.lotFrom.push(from)
    s.lotCpi.push(lotCpi)
    s.lotPre.push(pre)
  }

  /** Puts money into an investment. A "trade" pays brokerage, currency fee and spread (Fees on). */
  const invest = (s: Sleeve, amount: number, t: number, trade: boolean) => {
    if (amount <= 0) return
    bringUpToDate(s)
    let invested = amount
    if (trade && costsOn(s, t)) {
      const brokerage = brokerageFor(fs.brokerage, amount)
      const afterBrokerage = amount - brokerage
      const currency = settingsOf(s, t).usListed ? (afterBrokerage * fs.fxFeePct) / 100 : 0
      const spread = ((afterBrokerage - currency) * fs.spreadPct) / 100
      invested = afterBrokerage - currency - spread
      addFee('brokerage', brokerage)
      addFee('currency', currency)
      addFee('spread', spread)
    }
    const u = invested / s.price
    s.units += u
    // The cost base includes brokerage and other buying costs.
    if (taxOn) addLot(s, u, amount, c.discountFrom[t], cpi, 0)
  }

  /** Something you own at the start: its value, with its own cost base and purchase date (no buying costs). */
  const addHolding = (s: Sleeve, h: CompiledHolding) => {
    const u = h.value / s.price
    s.units += u
    if (taxOn) addLot(s, u, h.lotCost, h.lotFrom, h.lotCpi, h.lotPre)
  }

  /** 1 July 2027: what you own is treated as sold and bought back at its value (the gain up to then keeps the 50% discount). */
  const revalueAtReform = (s: Sleeve) => {
    bringUpToDate(s)
    for (let i = s.head; i < s.lotUnits.length; i++) {
      const value = s.units > 0 ? s.lotUnits[i] * s.price + (s.accrued * s.lotUnits[i]) / s.units : 0
      s.lotPre[i] += value - s.lotCost[i]
      s.lotCost[i] = value
      s.lotCpi[i] = cpi
    }
  }

  /** Records the capital gain or loss from selling `take` units of lot `i` for `perUnit` cents each, into `into`. Doesn't change the lot. */
  const realise = (s: Sleeve, i: number, take: number, perUnit: number, t: number, into: YearIncome) => {
    const share = s.lotUnits[i] > 0 ? take / s.lotUnits[i] : 0
    const proceeds = take * perUnit
    const cost = s.lotCost[i] * share
    const longTerm = t >= s.lotFrom[i]
    const addGain = (gain: number) => {
      if (gain >= 0) {
        if (longTerm) into.discountableGains += gain
        else into.otherGains += gain
      } else into.losses += -gain
    }
    if (t < reformT) return addGain(proceeds - cost)
    // From 1 July 2027: the gain up to then is a "deferred" gain under the old rules (with the 50% discount if held
    // at least 12 months by the day of this sale); the gain after uses an inflation-adjusted cost base.
    const pre = s.lotPre[i] * share
    if (pre >= 0) {
      if (longTerm) into.deferredDiscountableGains += pre
      else into.deferredOtherGains += pre
    } else into.losses += -pre
    if (proceeds < cost) into.losses += cost - proceeds
    else if (longTerm) into.indexedGains += Math.max(0, proceeds - Math.max(cost, (cost * cpi) / s.lotCpi[i]))
    else into.otherGains += proceeds - cost
  }

  const addFee = (kind: Exclude<keyof FeeTotals, 'total'>, amount: number) => {
    if (amount === 0) return
    fees[kind] += amount
    fees.total += amount
    year.fees += amount
    year.real.fees += amount / cpi
    real.fees += amount / cpi
  }

  /**
   * Sells `gross` cents' worth of one investment (capped at what it holds). Returns the cash you get.
   * With Tax on, records the capital gain or loss on each lot sold.
   */
  const sellFrom = (s: Sleeve, gross: number, t: number, trade: boolean): number => {
    bringUpToDate(s)
    const h = valueOf(s)
    if (h <= 0 || gross <= 0) return 0
    const all = gross >= h - 1e-9
    if (all) gross = h
    let net = gross
    if (trade && costsOn(s, t)) {
      const costs = saleCosts(gross, fs.brokerage, fs.spreadPct, settingsOf(s, t).usListed ? fs.fxFeePct : 0)
      addFee('brokerage', costs.brokerage)
      addFee('currency', costs.fx)
      addFee('spread', costs.spread)
      net = costs.net
    }
    const share = gross / h
    if (taxOn) {
      let toSell = all ? Infinity : s.units * share
      const unitsSelling = all ? s.units : toSell
      const proceedsPerUnit = unitsSelling > 0 ? net / unitsSelling : 0
      while (s.head < s.lotUnits.length && toSell > 0) {
        const head = s.head
        const take = Math.min(s.lotUnits[head], toSell)
        realise(s, head, take, proceedsPerUnit, t, income)
        const keep = s.lotUnits[head] > 0 ? 1 - take / s.lotUnits[head] : 0
        s.lotUnits[head] -= take
        s.lotCost[head] *= keep
        s.lotPre[head] *= keep
        toSell -= take
        if (s.lotUnits[head] <= 1e-9) s.head++
      }
    }
    if (all) {
      s.units = 0
      s.accrued = 0
      s.accFranked = s.accForeignTax = 0
      s.head = s.lotUnits.length
    } else {
      s.units -= s.units * share
      s.accrued -= s.accrued * share
      s.accFranked -= s.accFranked * share
      s.accForeignTax -= s.accForeignTax * share
    }
    return net
  }

  /** Sells `gross` cents' worth across everything you hold, from each investment in proportion to its value (pro-rata). */
  const sell = (gross: number, t: number, trade: boolean): number => {
    if (sleeves.length === 1) return sellFrom(main, gross, t, trade)
    const h = holdings()
    if (h <= 0 || gross <= 0) return 0
    const all = gross >= h - 1e-9
    let net = 0
    for (const s of sleeves) {
      const v = valueOf(s)
      if (v > 0) net += sellFrom(s, all ? v : (gross * v) / h, t, trade)
    }
    return net
  }

  /** Takes `amount` from waiting cash, then by selling (no trading costs). Returns how much it could take. */
  const takeFromBalance = (amount: number, t: number): number => {
    const fromCash = Math.min(cash, amount)
    cash -= fromCash
    let got = fromCash
    if (amount - got > 1e-9) got += sell(amount - got, t, false)
    return got
  }

  /** Money settle() may use after cash and selling run out: a withdrawal that emptied the investment, before it's paid to you. */
  let reserve = 0

  /**
   * Re-works this year's tax from the running totals and charges (or refunds) the difference.
   * Tax is paid first from `pot` (e.g. the distribution being taxed), then from cash, then by selling,
   * then from `reserve`. Returns what's left in the pot (refunds are added to it).
   */
  const settle = (t: number, pot = 0): number => {
    for (let i = 0; i < 8; i++) {
      const due = yearTax(ctx, income).tax - charged
      if (Math.abs(due) < 1e-4) break
      charged += due
      if (due > 0) {
        const fromPot = Math.min(pot, due)
        pot -= fromPot
        let paid = fromPot
        if (due - fromPot > 0) paid += takeFromBalance(due - fromPot, t)
        if (paid < due && reserve > 0) {
          const fromReserve = Math.min(reserve, due - paid)
          reserve -= fromReserve
          paid += fromReserve
        }
        if (paid < due - 0.5) {
          tax.unpaid += due - paid
          warn('unpaid', 'At some point there wasn’t enough left in the investment to pay the estimated tax, so part of it is shown as unpaid.')
        }
        tax.total += paid
        year.tax += paid
        year.real.tax += paid / cpi
        real.tax += paid / cpi
      } else {
        pot += -due
        tax.total += due
        year.tax += due
        year.real.tax += due / cpi
        real.tax += due / cpi
      }
    }
    return pot
  }

  /** A refund or leftover that goes back into the investment. */
  const putBack = (amount: number, t: number) => {
    if (amount <= 0) return
    if (feesOn) cash += amount
    else invest(main, amount, t, false)
  }

  const withdraw = (name: string, wanted: number, t: number) => {
    let got = Math.min(cash, wanted)
    cash -= got
    const remaining = wanted - got
    if (remaining > 0 && holdings() > 0) {
      let net = 0
      if (sleeves.length === 1) {
        const usListed = ph[c.phaseOf[t]].usListed
        const gross = costsOn(main, t) ? grossForNet(remaining, fs.brokerage, fs.spreadPct, usListed ? fs.fxFeePct : 0) : remaining
        net = sellFrom(main, gross, t, true)
      } else {
        // Holdings kept separately: taken from every investment in proportion to its value (pro-rata). If one can't
        // cover its share after its own selling costs, the rest comes from the others.
        for (let pass = 0; pass < 3 && remaining - net > 0.005; pass++) {
          const total = holdings()
          if (total <= 0) break
          const need = remaining - net
          for (const s of sleeves) {
            const v = valueOf(s)
            if (v <= 0) continue
            const want = (need * v) / total
            const gross = costsOn(s, t) ? grossForNet(want, fs.brokerage, fs.spreadPct, settingsOf(s, t).usListed ? fs.fxFeePct : 0) : want
            net += sellFrom(s, gross, t, true)
          }
        }
      }
      if (net > remaining) {
        cash += net - remaining
        got += remaining
      } else got += net
    }
    // Tax on the sale comes out of what's left in the investment. If the withdrawal took everything, there's
    // nothing left, so the tax comes out of the money being withdrawn and you get the rest.
    let taxFromWithdrawal = 0
    if (taxOn) {
      reserve = got
      const left = settle(t)
      taxFromWithdrawal = got - reserve
      reserve = 0
      got -= taxFromWithdrawal
      putBack(left, t)
    }
    if (got + taxFromWithdrawal < wanted - 0.5) {
      warnings.push(
        `“${name || 'Withdrawal'}” on ${dayToISO(c.startDay + t)} wanted $${(wanted / 100).toFixed(2)} but only $${((got + taxFromWithdrawal) / 100).toFixed(2)} was there, so the balance went to $0.` +
          (taxFromWithdrawal > 0.5 ? ` $${(taxFromWithdrawal / 100).toFixed(2)} of that went on the estimated tax on the sale, so $${(got / 100).toFixed(2)} was paid out.` : ''),
      )
    } else if (taxFromWithdrawal > 0.5) {
      warnings.push(
        `“${name || 'Withdrawal'}” on ${dayToISO(c.startDay + t)} sold everything, so the estimated tax on the sale ($${(taxFromWithdrawal / 100).toFixed(2)}) came out of it and $${(got / 100).toFixed(2)} was paid out.`,
      )
    }
    totalWithdrawn += got
    year.withdrawals += got
    year.real.withdrawals += got / cpi
    real.withdrawn += got / cpi
  }

  const chargeFee = (amount: number, t: number) => {
    if (amount <= 0) return
    const got = takeFromBalance(amount, t)
    addFee('platform', got)
  }

  const payDistribution = (s: Sleeve, t: number) => {
    bringUpToDate(s)
    const d = s.accrued
    // Each phase's franked %, foreign % and foreign tax % applied to the income built up while it was in force.
    const credits = frankingCredit(s.accFranked)
    const foreignTax = s.accForeignTax
    s.accrued = s.accFranked = s.accForeignTax = 0
    income.distributions += d
    income.frankingCredits += credits
    income.foreignTax += foreignTax
    tax.distributionsReceived += d
    tax.frankingCredits += credits
    const pot = settle(t, d)
    // Reinvested into the investment that paid it.
    if (ts.distributions === 'reinvest') invest(s, pot, t, false)
    else {
      totalPaidOut += pot
      year.paidOut += pot
      year.real.paidOut += pot / cpi
      real.paidOut += pot / cpi
    }
  }

  /**
   * "Move them into my plan's investments": holdings in something different are sold on the start date (brokerage,
   * spread and currency fee with Fees on; capital gains tax with Tax on, paid from the sale) and the money is put
   * into the first phase's investment straight away (buying costs with Fees on).
   */
  const moveHoldings = (t: number) => {
    let proceeds = 0
    for (const h of c.holdings) {
      if (h.role !== 'move') continue
      const s = newSleeve(h.settings)
      addHolding(s, h)
      if (taxOn && t === reformT) revalueAtReform(s)
      proceeds += sellFrom(s, h.value, t, true)
    }
    const pot = taxOn ? settle(t, proceeds) : proceeds
    invest(main, pot, t, true)
  }
  const moving = c.holdings.some((h) => h.role === 'move')

  const startYear = (k: number, t: number) => {
    fyIndex = k
    const info = c.fys[k]
    cpiAtFyStart[k] = cpi
    const bal = holdings() + cash
    const realBal = bal / cpi
    year = {
      fy: info.fy,
      firstDay: c.startDay + t,
      lastDay: c.startDay + t,
      opening: bal,
      deposits: 0,
      withdrawals: 0,
      growth: 0,
      fees: 0,
      tax: 0,
      paidOut: 0,
      closing: bal,
      cpiClosing: cpi,
      real: { opening: realBal, deposits: 0, withdrawals: 0, growth: 0, fees: 0, tax: 0, paidOut: 0, closing: realBal },
    }
    years.push(year)
    if (!taxOn) return
    let index = 1
    if (ts.brackets === 'indexed' && info.fy > latestTableFy) {
      // Thresholds rise each year with inflation: prices on this year's 1 July compared with 1 July of the latest
      // tax year we have (1 July 2027), whenever the plan starts. Days before the plan's start use the first
      // inflation rate (compile.ts works those out).
      const julyCpi = info.julyCpi ?? cpi
      let baseCpi = c.bracketBaseCpi
      if (baseCpi === null) {
        const base = c.fys.findIndex((f) => f.fy === latestTableFy)
        baseCpi = base >= 0 ? cpiAtFyStart[base] : 1
      }
      index = julyCpi / baseCpi
    }
    ctx = {
      year: tableFor(r.taxYears, info.fy),
      index,
      basis: ts.basis,
      medicare: ts.medicare,
      otherIncome: info.otherIncome,
      marginalRate: info.marginalRate,
      minorRates: info.minor && ts.minorMoney === 'family',
      cgtMinimumPct: ts.cgtRules === 'law' && ts.cgtMinimum && info.lastT >= reformT ? CGT_REFORM.minimumRatePct : 0,
      // Working Australians tax offset (from 2027–28), with "other income" counted as job income.
      workingOffsetMax: ts.basis === 'income' && info.fy >= WORKING_OFFSET.fromFy ? WORKING_OFFSET.max : 0,
    }
    income = emptyYearIncome()
    income.losses = carriedLosses
    charged = 0
  }

  /** Last day of a financial year: settle its tax and carry any unused capital losses forward. */
  const endYear = (t: number) => {
    putBack(settle(t), t)
    const final = yearTax(ctx, income)
    carriedLosses = final.lossesLeft
    tax.netCapitalGains += final.netCapitalGain
    tax.foreignTaxOffset += final.foreignTaxOffset
    tax.interest += income.interest
  }

  // ---- The money you have now is already invested on day one (no buying costs). ----
  // Part of the plan's investment (with its own cost base and purchase date), or kept separately.
  startYear(0, 0)
  for (const h of c.holdings) {
    if (h.role === 'plan') {
      if (h.plain) invest(main, h.value, 0, false)
      else addHolding(main, h)
    } else if (h.role === 'keep') addHolding(sleeves[1 + c.kept.indexOf(h)], h)
  }
  year.opening = year.closing = year.real.opening = year.real.closing = start
  if (detail) series.push({ day: c.startDay, balance: start, netContributed: start, cpi: 1, realNet: start })
  cpis[sampleCount] = 1
  balances[sampleCount++] = start

  let phase = 0
  for (let t = 0; t < n; t++) {
    if (c.fyOf[t] !== fyIndex) startYear(c.fyOf[t], t)
    const p = c.phaseOf[t]
    if (p !== phase || t === 0) {
      phase = p
      phaseStartCpi[p] = cpi
    }
    const rp = ph[p]

    // 1 July 2027: what you already own is treated as sold and bought back at its value, so the
    // gain up to then keeps the 50% discount and the gain after it uses the new rules.
    if (t === reformT && taxOn) for (const s of sleeves) revalueAtReform(s)

    // Start date: holdings being moved into the plan's investment are sold and the money reinvested.
    if (t === 0 && moving) moveHoldings(0)

    // 1. Money in and out at the start of the day.
    let incoming = 0
    if (c.depositDay[t]) {
      const base = c.deposit[t]
      const amount = inflOn && rp.growWithInflation ? Math.round((base * cpi) / phaseStartCpi[p]) : base
      const s = phases[p]
      s.depositTotal += amount
      if (s.firstDeposit === null) s.firstDeposit = amount
      s.lastDeposit = amount
      incoming = amount
    }
    const events = c.events.get(t)
    if (events) for (const e of events) if (e.amount >= 0) incoming += e.amount
    if (incoming > 0) {
      totalDeposited += incoming
      year.deposits += incoming
      year.real.deposits += incoming / cpi
      real.deposited += incoming / cpi
      if (feesOn) cash += incoming
      else invest(main, incoming, t, false)
    }
    if (events) for (const e of events) if (e.amount < 0) withdraw(e.name, -e.amount, t)

    // 2. Buying day: invest waiting cash, unless the brokerage would eat all of it.
    //    A cash/savings account takes deposits straight away, with no brokerage.
    if (feesOn && cash > 0 && (c.buyDay[t] || !rp.tradingCosts)) {
      if (!rp.tradingCosts || cash > brokerageFor(fs.brokerage, cash)) {
        const amount = cash
        cash = 0
        invest(main, amount, t, true)
      } else {
        warn('tooSmall', 'Some buys were put off because the brokerage would have been as much as the cash waiting. The cash waited for the next buying day.')
      }
    }

    // 3. One day of growth. Each month is 1/12 of a year, spread over its days.
    //    The plan's own investment follows the phase; a holding kept separately follows its own returns.
    const indexBefore = trackIndex ? holdings() : 0
    const g = path.growth[t]
    const h = taxOn ? (path.income && path.income[t] > 0 ? path.income[t] : incomeFactor[p * 4 + c.dim[t] - 28]) : 1
    if ((g !== 1 || h !== 1) && (main.units !== 0 || main.accrued !== 0)) {
      const before = main.units * main.price + main.accrued
      const after = before * g
      main.price = (main.price * g) / h
      const grown = main.accrued * g
      main.accrued = after - main.units * main.price
      if (taxOn) {
        // Split today's income by this phase's settings; what was already built up just grows.
        const earned = main.accrued - grown
        const dist = rp.distribution
        const foreign = (earned * dist.foreignPct) / 100
        main.accFranked = main.accFranked * g + (earned * dist.frankedPct) / 100
        main.accForeignTax = main.accForeignTax * g + (dist.foreignTaxPct < 100 ? (foreign * dist.foreignTaxPct) / (100 - dist.foreignTaxPct) : 0)
      }
      const growth = after - before
      totalGrowth += growth
      year.growth += growth
    }
    // Holdings kept separately follow their own returns (brought up to date at least every month end).
    for (let i = 1; i < sleeves.length; i++) {
      const s = sleeves[i]
      s.pendingGrowth *= s.growth![t]
      if (taxOn) s.pendingIncome *= s.income && s.income[t] > 0 ? s.income[t] : s.incomeFactor![c.dim[t] - 28]
    }
    if (sleeves.length > 1 && c.monthEndShare[t] > 0) bringAllUpToDate()
    if (trackIndex && indexBefore > 0) indexNow *= holdings() / indexBefore
    if (cash > 0) {
      const f = path.cash ? path.cash[t] : cashFactor[c.dim[t] - 28]
      if (f !== 1) {
        const interest = cash * (f - 1)
        cash += interest
        totalGrowth += interest
        year.growth += interest
        if (taxOn) income.interest += interest
      }
    }

    // 4. Last day of a month: management fee (MER) and monthly platform fee, for the part of the month in the plan.
    //    The MER is 1/12 of the yearly fee for a whole month, built up day by day at the rate of each day's phase
    //    (a holding kept separately: its own fee).
    if (feesOn) main.merDays += rp.mer
    const monthShare = c.monthEndShare[t]
    if (trackIndex && monthShare > 0) portfolioIndex.push(indexNow)
    if (feesOn && monthShare > 0) {
      // A holding kept separately has the same fee every day: its fee for this month's days in the plan.
      for (let i = 1; i < sleeves.length; i++) sleeves[i].merDays = sleeves[i].own!.mer * Math.round(monthShare * c.dim[t])
      for (const s of sleeves) {
        if (s.merDays > 0) {
          const keep = 1 - s.merDays / (100 * 12 * c.dim[t])
          s.merDays = 0
          const fee = valueOf(s) * (1 - keep)
          s.price *= keep
          s.accrued *= keep
          s.accFranked *= keep
          s.accForeignTax *= keep
          addFee('mer', fee)
        }
      }
      if (fs.platformFeePer === 'month') chargeFee(fs.platformFee * monthShare, t)
    }

    // 5. Distributions (each holding kept separately pays on its own days).
    if (taxOn) {
      if (c.payoutDay[t] && main.accrued > 0) payDistribution(main, t)
      // (Payouts are always on a month end, or the plan's last day, which is one too.)
      if (monthShare > 0) {
        for (let i = 1; i < sleeves.length; i++) {
          const s = sleeves[i]
          if (s.payoutDay![t] && s.accrued > 0) payDistribution(s, t)
        }
      }
    }

    // 6. End of a financial year (or of the plan).
    const isLast = t === n - 1
    if (t === c.fys[fyIndex].lastT) {
      if (feesOn && fs.platformFeePer === 'year') chargeFee(fs.platformFee * c.fys[fyIndex].share, t)
      if (taxOn && isLast && ts.atEnd === 'sell') {
        const marketValue = holdings()
        const taxBefore = tax.total
        const feesBefore = fees.total
        cash += sell(marketValue, t, true)
        endYear(t)
        endSale = { mode: 'sell', marketValue, costs: fees.total - feesBefore, tax: tax.total - taxBefore, afterTax: cash + holdings() }
      } else if (taxOn) {
        endYear(t)
        if (isLast) endSale = imaginedSale(t)
      }
    }

    cpi *= path.inflation[t]
    year.lastDay = c.startDay + t
    year.cpiClosing = cpi
    // The balance is only needed on chart days, the last day of a year, and every day for a goal.
    const chartDay = isLast || (t + 1) % sampleEvery === 0
    if (chartDay || plan.goal || t === c.fys[fyIndex].lastT) {
      const balance = holdings() + cash
      year.closing = balance
      const yr = year.real
      yr.closing = balance / cpi
      yr.growth = yr.closing - yr.opening - yr.deposits + yr.withdrawals + yr.fees + yr.tax + yr.paidOut

      if (plan.goal) {
        const goalValue = inflOn ? balance / cpi : balance
        if (firstReachedT < 0 && goalValue >= plan.goal.amount) firstReachedT = t
        if (t === goalCheckT) goalBalance = goalValue
      }
      if (chartDay) {
        cpis[sampleCount] = cpi
        balances[sampleCount++] = balance
        if (detail) {
          series.push({
            day: c.startDay + t + 1,
            balance,
            netContributed: start + totalDeposited - totalWithdrawn,
            cpi,
            realNet: start + real.deposited - real.withdrawn,
          })
        }
      }
    }
  }

  /** "Don't sell": the tax you'd owe if you sold everything on the last day. Changes nothing. */
  function imaginedSale(t: number): EndSale {
    bringAllUpToDate()
    const marketValue = holdings()
    const extra: YearIncome = { ...income }
    let net = 0
    for (const s of sleeves) {
      const v = valueOf(s)
      const costs = costsOn(s, t) ? saleCosts(v, fs.brokerage, fs.spreadPct, settingsOf(s, t).usListed ? fs.fxFeePct : 0) : null
      const sleeveNet = costs ? costs.net : v
      net += sleeveNet
      if (s.units > 0) {
        const perUnit = sleeveNet / s.units
        for (let i = s.head; i < s.lotUnits.length; i++) realise(s, i, s.lotUnits[i], perUnit, t, extra)
      }
    }
    const saleTax = yearTax(ctx, extra).tax - charged
    return { mode: 'hold', marketValue, costs: marketValue - net, tax: saleTax, afterTax: cash + net - saleTax }
  }

  const finalBalance = holdings() + cash
  let goal: GoalCheck | null = null
  if (plan.goal && goalDayRaw !== null) {
    const day = c.startDay + goalCheckT
    goal = {
      amount: plan.goal.amount,
      day,
      balanceOnDay: goalBalance,
      reached: goalBalance >= plan.goal.amount,
      firstReachedDay: firstReachedT < 0 ? null : c.startDay + firstReachedT,
      outsidePlan: goalDayRaw !== day,
      inTodaysDollars: inflOn,
    }
  }

  const result: SimResult = {
    switches: sw,
    startDay: c.startDay,
    endDay: c.endDay,
    finalBalance,
    finalReal: finalBalance / cpi,
    cpiEnd: cpi,
    startingBalance: start,
    totalDeposited,
    totalWithdrawn,
    totalGrowth,
    netContributed: start + totalDeposited - totalWithdrawn,
    totalPaidOut,
    fees,
    tax,
    real: {
      ...real,
      netContributed: start + real.deposited - real.withdrawn,
      growth: finalBalance / cpi - (start + real.deposited - real.withdrawn - real.fees - real.tax - real.paidOut),
    },
    endSale,
    balances: balances.subarray(0, sampleCount),
    cpis: cpis.subarray(0, sampleCount),
    series,
    years,
    phases,
    goal,
    warnings,
  }
  if (trackIndex) result.portfolioIndex = Float64Array.from(portfolioIndex)
  return result
}

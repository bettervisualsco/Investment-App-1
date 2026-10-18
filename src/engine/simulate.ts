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
// Tax is estimated per Australian financial year. Each time something taxable
// happens (a distribution, a sale), the year's tax is re-worked from the year's
// running totals and only the difference is charged, so by 30 June the year's
// total is exactly the tax on the whole year's income.

import type { CompiledPlan } from './compile'
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
}

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
  const warnings: string[] = [...c.warnings, ...path.warnings]
  const warnOnce = new Set<string>()
  const warn = (key: string, text: string) => {
    if (warnOnce.has(key)) return
    warnOnce.add(key)
    warnings.push(text)
  }

  // ---- Holdings -----------------------------------------------------------
  let price = 1 // cents per unit; units start as whole cents
  let units = 0
  let accrued = 0
  // Tax on: how much of `accrued` is franked, and the foreign tax already taken from its foreign part.
  let accFranked = 0
  let accForeignTax = 0
  let cash = 0
  // Fees on: the management fee built up so far this month (sum of each day's yearly MER %).
  let merDays = 0
  // Purchase lots (Tax on only), oldest first. `head` is the oldest lot still held.
  const lotUnits: number[] = []
  const lotCost: number[] = []
  const lotFrom: number[] = []
  const lotCpi: number[] = [] // price level when the cost base was set (for cost base indexation)
  const lotPre: number[] = [] // gain (or loss) up to 30 June 2027, kept for when the lot is sold
  let head = 0
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

  const holdings = () => units * price + accrued
  /** Buying and selling on day t pays trading costs (Fees on, and not a cash/savings account). */
  const costsOn = (t: number) => feesOn && ph[c.phaseOf[t]].tradingCosts

  // ---- Buying and selling -------------------------------------------------

  /** Puts money into the investment. A "trade" pays brokerage, currency fee and spread (Fees on). */
  const invest = (amount: number, t: number, trade: boolean) => {
    if (amount <= 0) return
    let invested = amount
    if (trade && costsOn(t)) {
      const brokerage = brokerageFor(fs.brokerage, amount)
      const afterBrokerage = amount - brokerage
      const currency = ph[c.phaseOf[t]].usListed ? (afterBrokerage * fs.fxFeePct) / 100 : 0
      const spread = ((afterBrokerage - currency) * fs.spreadPct) / 100
      invested = afterBrokerage - currency - spread
      addFee('brokerage', brokerage)
      addFee('currency', currency)
      addFee('spread', spread)
    }
    const u = invested / price
    units += u
    if (taxOn) {
      // The cost base includes brokerage and other buying costs.
      lotUnits.push(u)
      lotCost.push(amount)
      lotFrom.push(c.discountFrom[t])
      lotCpi.push(cpi)
      lotPre.push(0)
    }
  }

  /** Records the capital gain or loss from selling `take` units of lot `i` for `perUnit` cents each, into `into`. Doesn't change the lot. */
  const realise = (i: number, take: number, perUnit: number, t: number, into: YearIncome) => {
    const share = lotUnits[i] > 0 ? take / lotUnits[i] : 0
    const proceeds = take * perUnit
    const cost = lotCost[i] * share
    const longTerm = t >= lotFrom[i]
    const addGain = (gain: number) => {
      if (gain >= 0) {
        if (longTerm) into.discountableGains += gain
        else into.otherGains += gain
      } else into.losses += -gain
    }
    if (t < reformT) return addGain(proceeds - cost)
    // From 1 July 2027: the gain up to then is a "deferred" gain under the old rules (with the 50% discount if held
    // at least 12 months by the day of this sale); the gain after uses an inflation-adjusted cost base.
    const pre = lotPre[i] * share
    if (pre >= 0) {
      if (longTerm) into.deferredDiscountableGains += pre
      else into.deferredOtherGains += pre
    } else into.losses += -pre
    if (proceeds < cost) into.losses += cost - proceeds
    else if (longTerm) into.indexedGains += Math.max(0, proceeds - Math.max(cost, (cost * cpi) / lotCpi[i]))
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
   * Sells `gross` cents' worth (capped at what you hold). Returns the cash you get.
   * With Tax on, records the capital gain or loss on each lot sold.
   */
  const sell = (gross: number, t: number, trade: boolean): number => {
    const h = holdings()
    if (h <= 0 || gross <= 0) return 0
    const all = gross >= h - 1e-9
    if (all) gross = h
    let net = gross
    if (trade && costsOn(t)) {
      const costs = saleCosts(gross, fs.brokerage, fs.spreadPct, ph[c.phaseOf[t]].usListed ? fs.fxFeePct : 0)
      addFee('brokerage', costs.brokerage)
      addFee('currency', costs.fx)
      addFee('spread', costs.spread)
      net = costs.net
    }
    const share = gross / h
    if (taxOn) {
      let toSell = all ? Infinity : units * share
      const unitsSelling = all ? units : toSell
      const proceedsPerUnit = unitsSelling > 0 ? net / unitsSelling : 0
      while (head < lotUnits.length && toSell > 0) {
        const take = Math.min(lotUnits[head], toSell)
        realise(head, take, proceedsPerUnit, t, income)
        const keep = lotUnits[head] > 0 ? 1 - take / lotUnits[head] : 0
        lotUnits[head] -= take
        lotCost[head] *= keep
        lotPre[head] *= keep
        toSell -= take
        if (lotUnits[head] <= 1e-9) head++
      }
    }
    if (all) {
      units = 0
      accrued = 0
      accFranked = accForeignTax = 0
      head = lotUnits.length
    } else {
      units -= units * share
      accrued -= accrued * share
      accFranked -= accFranked * share
      accForeignTax -= accForeignTax * share
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
    else invest(amount, t, false)
  }

  const withdraw = (name: string, wanted: number, t: number) => {
    let got = Math.min(cash, wanted)
    cash -= got
    const remaining = wanted - got
    if (remaining > 0 && holdings() > 0) {
      const usListed = ph[c.phaseOf[t]].usListed
      const gross = costsOn(t) ? grossForNet(remaining, fs.brokerage, fs.spreadPct, usListed ? fs.fxFeePct : 0) : remaining
      const net = sell(gross, t, true)
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

  const payDistribution = (t: number) => {
    const d = accrued
    // Each phase's franked %, foreign % and foreign tax % applied to the income built up while it was in force.
    const credits = frankingCredit(accFranked)
    const foreignTax = accForeignTax
    accrued = accFranked = accForeignTax = 0
    income.distributions += d
    income.frankingCredits += credits
    income.foreignTax += foreignTax
    tax.distributionsReceived += d
    tax.frankingCredits += credits
    const pot = settle(t, d)
    if (ts.distributions === 'reinvest') invest(pot, t, false)
    else {
      totalPaidOut += pot
      year.paidOut += pot
      year.real.paidOut += pot / cpi
      real.paidOut += pot / cpi
    }
  }

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

  // ---- The starting balance is already invested on day one (no buying costs). ----
  startYear(0, 0)
  if (plan.startingBalance > 0) invest(plan.startingBalance, 0, false)
  year.opening = year.closing = year.real.opening = year.real.closing = plan.startingBalance
  if (detail) series.push({ day: c.startDay, balance: plan.startingBalance, netContributed: plan.startingBalance, cpi: 1, realNet: plan.startingBalance })
  cpis[sampleCount] = 1
  balances[sampleCount++] = plan.startingBalance

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
    if (t === reformT && taxOn) {
      for (let i = head; i < lotUnits.length; i++) {
        const value = units > 0 ? lotUnits[i] * price + (accrued * lotUnits[i]) / units : 0
        lotPre[i] += value - lotCost[i]
        lotCost[i] = value
        lotCpi[i] = cpi
      }
    }

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
      else invest(incoming, t, false)
    }
    if (events) for (const e of events) if (e.amount < 0) withdraw(e.name, -e.amount, t)

    // 2. Buying day: invest waiting cash, unless the brokerage would eat all of it.
    //    A cash/savings account takes deposits straight away, with no brokerage.
    if (feesOn && cash > 0 && (c.buyDay[t] || !rp.tradingCosts)) {
      if (!rp.tradingCosts || cash > brokerageFor(fs.brokerage, cash)) {
        const amount = cash
        cash = 0
        invest(amount, t, true)
      } else {
        warn('tooSmall', 'Some buys were put off because the brokerage would have been as much as the cash waiting. The cash waited for the next buying day.')
      }
    }

    // 3. One day of growth. Each month is 1/12 of a year, spread over its days.
    const g = path.growth[t]
    const h = taxOn ? (path.income && path.income[t] > 0 ? path.income[t] : incomeFactor[p * 4 + c.dim[t] - 28]) : 1
    if ((g !== 1 || h !== 1) && (units !== 0 || accrued !== 0)) {
      const before = holdings()
      const after = before * g
      price = (price * g) / h
      const grown = accrued * g
      accrued = after - units * price
      if (taxOn) {
        // Split today's income by this phase's settings; what was already built up just grows.
        const earned = accrued - grown
        const dist = rp.distribution
        const foreign = (earned * dist.foreignPct) / 100
        accFranked = accFranked * g + (earned * dist.frankedPct) / 100
        accForeignTax = accForeignTax * g + (dist.foreignTaxPct < 100 ? (foreign * dist.foreignTaxPct) / (100 - dist.foreignTaxPct) : 0)
      }
      const growth = after - before
      totalGrowth += growth
      year.growth += growth
    }
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
    //    The MER is 1/12 of the yearly fee for a whole month, built up day by day at the rate of each day's phase.
    if (feesOn) merDays += rp.mer
    const monthShare = c.monthEndShare[t]
    if (feesOn && monthShare > 0) {
      if (merDays > 0) {
        const keep = 1 - merDays / (100 * 12 * c.dim[t])
        merDays = 0
        const fee = holdings() * (1 - keep)
        price *= keep
        accrued *= keep
        accFranked *= keep
        accForeignTax *= keep
        addFee('mer', fee)
      }
      if (fs.platformFeePer === 'month') chargeFee(fs.platformFee * monthShare, t)
    }

    // 5. Distributions.
    if (taxOn && c.payoutDay[t] && accrued > 0) payDistribution(t)

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
    const balance = holdings() + cash
    year.lastDay = c.startDay + t
    year.closing = balance
    year.cpiClosing = cpi
    const yr = year.real
    yr.closing = balance / cpi
    yr.growth = yr.closing - yr.opening - yr.deposits + yr.withdrawals + yr.fees + yr.tax + yr.paidOut

    if (plan.goal) {
      const goalValue = inflOn ? balance / cpi : balance
      if (firstReachedT < 0 && goalValue >= plan.goal.amount) firstReachedT = t
      if (t === goalCheckT) goalBalance = goalValue
    }
    if (isLast || (t + 1) % sampleEvery === 0) {
      cpis[sampleCount] = cpi
      balances[sampleCount++] = balance
      if (detail) {
        series.push({
          day: c.startDay + t + 1,
          balance,
          netContributed: plan.startingBalance + totalDeposited - totalWithdrawn,
          cpi,
          realNet: plan.startingBalance + real.deposited - real.withdrawn,
        })
      }
    }
  }

  /** "Don't sell": the tax you'd owe if you sold everything on the last day. Changes nothing. */
  function imaginedSale(t: number): EndSale {
    const marketValue = holdings()
    const usListed = ph[c.phaseOf[t]].usListed
    const costs = costsOn(t) ? saleCosts(marketValue, fs.brokerage, fs.spreadPct, usListed ? fs.fxFeePct : 0) : null
    const net = costs ? costs.net : marketValue
    const extra: YearIncome = { ...income }
    if (units > 0) {
      const perUnit = net / units
      for (let i = head; i < lotUnits.length; i++) realise(i, lotUnits[i], perUnit, t, extra)
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

  return {
    switches: sw,
    startDay: c.startDay,
    endDay: c.endDay,
    finalBalance,
    finalReal: finalBalance / cpi,
    cpiEnd: cpi,
    startingBalance: plan.startingBalance,
    totalDeposited,
    totalWithdrawn,
    totalGrowth,
    netContributed: plan.startingBalance + totalDeposited - totalWithdrawn,
    totalPaidOut,
    fees,
    tax,
    real: {
      ...real,
      netContributed: plan.startingBalance + real.deposited - real.withdrawn,
      growth: finalBalance / cpi - (plan.startingBalance + real.deposited - real.withdrawn - real.fees - real.tax - real.paidOut),
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
}

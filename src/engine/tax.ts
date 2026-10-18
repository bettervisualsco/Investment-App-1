// Australian tax on investment income: a simplified estimate.
//
// Rates come from taxTables.ts (checked on ato.gov.au). Money here is cents;
// the tables are in whole dollars like the ATO writes them, so thresholds are
// multiplied by 100. `index` scales every dollar threshold and amount when
// "brackets rise with inflation" is chosen (1 = as written).

import type { TaxYear } from './types'

/** Tax from the brackets alone (before offsets and the Medicare levy). */
export function bracketTax(year: TaxYear, income: number, index = 1): number {
  let tax = 0
  const b = year.brackets
  for (let i = 0; i < b.length; i++) {
    const lower = b[i].over * 100 * index
    if (income <= lower) break
    const upper = i + 1 < b.length ? b[i + 1].over * 100 * index : Infinity
    tax += ((Math.min(income, upper) - lower) * b[i].rate) / 100
  }
  return tax
}

/** Low income tax offset (LITO), cents. It can reduce tax to $0 but is never paid out as a refund. */
export function litoFor(year: TaxYear, income: number, index = 1): number {
  const l = year.lito
  const t1 = l.taper1From * 100 * index
  const t2 = l.taper2From * 100 * index
  const max = l.max * 100 * index
  let offset: number
  if (income <= t1) offset = max
  else if (income <= t2) offset = max - ((income - t1) * l.taper1Rate) / 100
  else offset = max - ((t2 - t1) * l.taper1Rate) / 100 - ((income - t2) * l.taper2Rate) / 100
  return Math.max(0, offset)
}

/**
 * Medicare levy, cents. Nothing at or below the lower threshold; then it
 * phases in at `shadeInRate`% of the income above that threshold, until it
 * reaches the full `rate`% of the whole income.
 */
export function medicareLevy(year: TaxYear, income: number, index = 1): number {
  const m = year.medicare
  const lower = m.lowerThreshold * 100 * index
  if (income <= lower) return 0
  return Math.min((income * m.rate) / 100, ((income - lower) * m.shadeInRate) / 100)
}

/** Income tax for a resident adult on a whole year's taxable income, cents. */
export function incomeTax(year: TaxYear, income: number, opts: { medicare: boolean; index?: number }): number {
  const index = opts.index ?? 1
  if (income <= 0) return 0
  const afterOffset = Math.max(0, bracketTax(year, income, index) - litoFor(year, income, index))
  return afterOffset + (opts.medicare ? medicareLevy(year, income, index) : 0)
}

/** Under-18 special tax on "eligible" (unearned) income, cents. Not indexed: these limits are fixed in the law. */
export function minorEligibleTax(year: TaxYear, eligible: number): number {
  const r = year.minor
  if (eligible <= r.nilUpTo * 100) return 0
  if (eligible <= r.fullFrom * 100) return ((eligible - r.nilUpTo * 100) * r.shadeRate) / 100
  return (eligible * r.fullRate) / 100
}

/**
 * A year's net capital gain, after losses and the 50% discount.
 *   discountable: gains that get the 50% discount (held at least 12 months, gains up to 30 June 2027)
 *   indexed:      gains worked out with an inflation-adjusted cost base (held at least 12 months, gains from 1 July 2027)
 *   other:        gains on things held less than 12 months
 * Losses come off the gains taxed in full first (the order that leaves you paying least), then the discount applies.
 */
export function netCapitalGain(
  discountable: number,
  other: number,
  losses: number,
  indexed = 0,
): { net: number; indexedNet: number; lossesLeft: number } {
  let left = losses
  const take = (gain: number) => {
    const used = Math.min(left, gain)
    left -= used
    return gain - used
  }
  const otherLeft = take(other)
  const indexedLeft = take(indexed)
  const discountableLeft = take(discountable)
  return { net: otherLeft + indexedLeft + discountableLeft * 0.5, indexedNet: indexedLeft, lossesLeft: left }
}

/** How tax works out for one financial year. */
export interface TaxYearContext {
  year: TaxYear
  index: number
  basis: 'income' | 'rate'
  medicare: boolean
  /** Your other taxable income for the year (basis "income"), cents. */
  otherIncome: number
  /** Your marginal rate (basis "rate"), %. */
  marginalRate: number
  /** Under-18 special rates apply to this investment income. */
  minorRates: boolean
  /** Minimum tax on indexed (from 1 July 2027) net capital gains, % (0 = none). */
  cgtMinimumPct: number
}

/** Extra tax caused by `assessable` cents of investment income on top of your other income (before credits). */
export function extraTax(ctx: TaxYearContext, assessable: number): number {
  if (assessable <= 0) return 0
  const { year, index } = ctx
  const levyRate = ctx.medicare ? year.medicare.rate : 0
  if (ctx.minorRates) {
    const levy =
      ctx.basis === 'income'
        ? ctx.medicare
          ? medicareLevy(year, ctx.otherIncome + assessable, index) - medicareLevy(year, ctx.otherIncome, index)
          : 0
        : (assessable * levyRate) / 100
    return minorEligibleTax(year, assessable) + levy
  }
  if (ctx.basis === 'rate') return (assessable * (ctx.marginalRate + levyRate)) / 100
  return incomeTax(year, ctx.otherIncome + assessable, { medicare: ctx.medicare, index }) - incomeTax(year, ctx.otherIncome, { medicare: ctx.medicare, index })
}

/** Everything the investment earned in one financial year that tax is worked out on. */
export interface YearIncome {
  /** Distributions paid to you (cash amount), cents. */
  distributions: number
  /** Franking credits attached to them. */
  frankingCredits: number
  /** Foreign tax already taken out of the foreign part. */
  foreignTax: number
  /** Interest earned by waiting cash. */
  interest: number
  /** Capital gains on things held at least 12 months (before the discount). */
  discountableGains: number
  /** Capital gains on things held less than 12 months. */
  otherGains: number
  /** Capital gains from 1 July 2027 on things held at least 12 months, after indexing the cost base. */
  indexedGains: number
  /** Capital losses this year plus losses carried forward from earlier years. */
  losses: number
}

export interface YearTax {
  assessable: number
  netCapitalGain: number
  lossesLeft: number
  taxBeforeCredits: number
  /** Extra tax added so net capital gains from 1 July 2027 pay at least the minimum rate. */
  minimumTaxTopUp: number
  foreignTaxOffset: number
  frankingCredits: number
  /** What you pay (negative = a refund, from franking credits). */
  tax: number
}

export function emptyYearIncome(): YearIncome {
  return { distributions: 0, frankingCredits: 0, foreignTax: 0, interest: 0, discountableGains: 0, otherGains: 0, indexedGains: 0, losses: 0 }
}

/**
 * Tax caused by the investment in one financial year.
 *
 *   assessable = distributions + franking credits + foreign tax paid + interest + net capital gain
 *   tax        = extra tax on that (+ any minimum-tax top-up) − foreign income tax offset − franking credits
 *
 * Franking credits are refundable (tax can go below $0). The foreign income tax
 * offset is not: it can only cancel tax, and never more than the extra tax.
 */
export function yearTax(ctx: TaxYearContext, income: YearIncome): YearTax {
  const cg = netCapitalGain(income.discountableGains, income.otherGains, income.losses, income.indexedGains)
  const assessable = income.distributions + income.frankingCredits + income.foreignTax + income.interest + cg.net
  let before = extraTax(ctx, assessable)
  // Minimum tax: the tax caused by the indexed gains must be at least the minimum rate of them.
  let topUp = 0
  if (ctx.cgtMinimumPct > 0 && cg.indexedNet > 0) {
    const onIndexed = before - extraTax(ctx, assessable - cg.indexedNet)
    topUp = Math.max(0, (cg.indexedNet * ctx.cgtMinimumPct) / 100 - onIndexed)
    before += topUp
  }
  const fito = Math.min(income.foreignTax, before)
  return {
    assessable,
    netCapitalGain: cg.net,
    lossesLeft: cg.lossesLeft,
    taxBeforeCredits: before,
    minimumTaxTopUp: topUp,
    foreignTaxOffset: fito,
    frankingCredits: income.frankingCredits,
    tax: before - fito - income.frankingCredits,
  }
}

/** Franking credit on a franked distribution: the company tax already paid on it (30%). */
export function frankingCredit(frankedAmount: number, companyRatePct = 30): number {
  return (frankedAmount * companyRatePct) / (100 - companyRatePct)
}

/** The tax table for a financial year: that year's, or the nearest year we have. */
export function tableFor(years: TaxYear[], fy: number): TaxYear {
  let pick = years[0]
  for (const y of years) if (y.fy <= fy) pick = y
  return pick
}

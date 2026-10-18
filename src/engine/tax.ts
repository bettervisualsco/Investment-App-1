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

/** The tax-free threshold: where the first bracket with a rate above 0% starts, dollars ($18,200). */
export function taxFreeThreshold(year: TaxYear): number {
  const first = year.brackets.find((b) => b.rate > 0)
  return first ? first.over : Infinity
}

/**
 * Working Australians tax offset (from 2027–28; ITAA 1997 s61-155 and s61-160, added by Treasury Laws Amendment
 * (Tax Reform No. 1) Act 2026, Schedule 3), cents. Only if your net labour income is above the tax-free threshold;
 * then the lesser of `maxDollars` ($250) and the basic tax on your labour income alone. Not refundable.
 */
export function workingOffset(year: TaxYear, labour: number, maxDollars: number, index = 1): number {
  if (maxDollars <= 0 || labour <= taxFreeThreshold(year) * 100 * index) return 0
  return Math.min(maxDollars * 100 * index, bracketTax(year, labour, index))
}

export interface IncomeTaxOptions {
  medicare: boolean
  index?: number
  /** Net labour income (job income) for the Working Australians tax offset, cents. */
  labour?: number
  /** That offset's maximum for the year, dollars (0 or missing = not available that year). */
  workingOffsetMax?: number
}

/**
 * Income tax for a resident adult on a whole year's taxable income, cents: the brackets, less the low income tax
 * offset and the Working Australians tax offset (neither can take tax below $0), plus the Medicare levy.
 */
export function incomeTax(year: TaxYear, income: number, opts: IncomeTaxOptions): number {
  const index = opts.index ?? 1
  if (income <= 0) return 0
  const offsets = litoFor(year, income, index) + workingOffset(year, opts.labour ?? 0, opts.workingOffsetMax ?? 0, index)
  const afterOffsets = Math.max(0, bracketTax(year, income, index) - offsets)
  return afterOffsets + (opts.medicare ? medicareLevy(year, income, index) : 0)
}

/** Under-18 special tax on "eligible" (unearned) income, cents. Not indexed: these limits are fixed in the law. */
export function minorEligibleTax(year: TaxYear, eligible: number): number {
  const r = year.minor
  if (eligible <= r.nilUpTo * 100) return 0
  if (eligible <= r.fullFrom * 100) return ((eligible - r.nilUpTo * 100) * r.shadeRate) / 100
  return (eligible * r.fullRate) / 100
}

/** A year's capital gains, sorted into the groups the law treats differently (cents, before losses and the discount). */
export interface CapitalGains {
  /**
   * Part of a sale from 1 July 2027 that is the gain up to 30 June 2027 (the "deferred" gain from the deemed sale on that
   * day, ITAA 1997 s112-160), on something held at least 12 months: it keeps the 50% discount.
   */
  deferredDiscountable: number
  /** The same, on something held less than 12 months: no discount. */
  deferredOther: number
  /** Gains on things held less than 12 months (from 1 July 2027 these are "non-residential capital gains" too). */
  other: number
  /** Gains from 1 July 2027 on things held at least 12 months, after indexing the cost base. */
  indexed: number
  /** Gains on things held at least 12 months, sold before 1 July 2027 (or with "keep the 50% discount"). */
  discountable: number
}

/**
 * A year's net capital gain, after losses and the 50% discount (ITAA 1997 s102-5(1), as amended from 2027–28).
 *
 * Losses (this year's, then ones carried forward: the same order) come off:
 *   1. the deferred gains up to 30 June 2027 ("deferred non-residential capital gains", Step 1(a)); within that group
 *      you choose the order (Note 3), so the ones without the discount go first, as that leaves less tax;
 *   2. then the gains from 1 July 2027 ("non-residential capital gains", Step 1(c)): short-term and indexed gains,
 *      both taxed in full;
 *   3. then (sales before 1 July 2027, or "keep the 50% discount") discountable gains, after short-term ones: the
 *      order that leaves you paying least, as the law allowed before 2027–28.
 * ETFs aren't residential property, so the residential groups (Step 1(b) and (d)) are always empty here.
 * Then what's left of the discountable gains is halved (Step 5).
 *
 * `minimumTaxBase` is what's left of the gains from 1 July 2027 (short-term and indexed): the "minimum tax capital gain"
 * of s119-5 (non-residential capital gains remaining after the s102-5 steps). Deferred gains aren't part of it.
 */
export function netCapitalGain(g: CapitalGains, losses: number): { net: number; minimumTaxBase: number; lossesLeft: number } {
  let left = losses
  const take = (gain: number) => {
    const used = Math.min(left, gain)
    left -= used
    return gain - used
  }
  const deferredOther = take(g.deferredOther)
  const deferredDiscountable = take(g.deferredDiscountable)
  const other = take(g.other)
  const indexed = take(g.indexed)
  const discountable = take(g.discountable)
  return {
    net: deferredOther + deferredDiscountable * 0.5 + other + indexed + discountable * 0.5,
    minimumTaxBase: other + indexed,
    lossesLeft: left,
  }
}

/** How tax works out for one financial year. */
export interface TaxYearContext {
  year: TaxYear
  index: number
  basis: 'income' | 'rate'
  medicare: boolean
  /** Your other taxable income for the year (basis "income"), cents. Treated as job (labour) income. */
  otherIncome: number
  /** Your marginal rate (basis "rate"), %. */
  marginalRate: number
  /** Under-18 special rates apply to this investment income. */
  minorRates: boolean
  /** Minimum tax on net capital gains made from 1 July 2027, % (0 = none). */
  cgtMinimumPct: number
  /**
   * Working Australians tax offset maximum this year, dollars (basis "income", adult rates; 0 or missing = none).
   * `otherIncome` is treated as net labour income for it.
   */
  workingOffsetMax?: number
}

const incomeOpts = (ctx: TaxYearContext) => ({
  medicare: ctx.medicare,
  index: ctx.index,
  labour: ctx.otherIncome,
  workingOffsetMax: ctx.workingOffsetMax ?? 0,
})

/**
 * Under-18 tax on `eligible` cents of investment income (from family money): the special rates or, if it is greater,
 * the tax on that income as the top slice of their total income at the general rates (ATO under-18 rates, note to
 * the 66% band; below $417 only the general rates apply). No low income tax offset either way.
 */
export function minorTax(ctx: TaxYearContext, eligible: number): number {
  if (eligible <= 0) return 0
  const special = minorEligibleTax(ctx.year, eligible)
  const topSlice =
    ctx.basis === 'income'
      ? bracketTax(ctx.year, ctx.otherIncome + eligible, ctx.index) - bracketTax(ctx.year, ctx.otherIncome, ctx.index)
      : (eligible * ctx.marginalRate) / 100
  return Math.max(special, topSlice)
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
    return minorTax(ctx, assessable) + levy
  }
  if (ctx.basis === 'rate') return (assessable * (ctx.marginalRate + levyRate)) / 100
  return incomeTax(year, ctx.otherIncome + assessable, incomeOpts(ctx)) - incomeTax(year, ctx.otherIncome, incomeOpts(ctx))
}

/**
 * "Basic" income tax caused by `assessable` cents: the brackets (or your rate, or the under-18 rates), before any
 * offsets and without the Medicare levy. The minimum tax on capital gains is compared against this.
 */
export function basicExtraTax(ctx: TaxYearContext, assessable: number): number {
  if (assessable <= 0) return 0
  if (ctx.minorRates) return minorTax(ctx, assessable)
  if (ctx.basis === 'rate') return (assessable * ctx.marginalRate) / 100
  return bracketTax(ctx.year, ctx.otherIncome + assessable, ctx.index) - bracketTax(ctx.year, ctx.otherIncome, ctx.index)
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
  /** Capital gains on things held at least 12 months, sold before 1 July 2027 (before the discount). */
  discountableGains: number
  /** Capital gains on things held less than 12 months (from 1 July 2027: the part of the gain from that date). */
  otherGains: number
  /** Capital gains from 1 July 2027 on things held at least 12 months, after indexing the cost base. */
  indexedGains: number
  /** Sales from 1 July 2027: the gain up to 30 June 2027 on things held at least 12 months (keeps the discount). */
  deferredDiscountableGains: number
  /** Sales from 1 July 2027: the gain up to 30 June 2027 on things held less than 12 months. */
  deferredOtherGains: number
  /** Capital losses this year plus losses carried forward from earlier years. */
  losses: number
}

export interface YearTax {
  assessable: number
  netCapitalGain: number
  lossesLeft: number
  taxBeforeCredits: number
  /** Extra tax added so net capital gains from 1 July 2027 pay at least the minimum rate (whole dollars). */
  minimumTaxTopUp: number
  foreignTaxOffset: number
  frankingCredits: number
  /** What you pay (negative = a refund, from franking credits, or the foreign tax offset cancelling tax on your other income). */
  tax: number
}

export function emptyYearIncome(): YearIncome {
  return {
    distributions: 0,
    frankingCredits: 0,
    foreignTax: 0,
    interest: 0,
    discountableGains: 0,
    otherGains: 0,
    indexedGains: 0,
    deferredDiscountableGains: 0,
    deferredOtherGains: 0,
    losses: 0,
  }
}

/**
 * Tax caused by the investment in one financial year.
 *
 *   assessable = distributions + franking credits + foreign tax paid + interest + net capital gain
 *   tax        = extra tax on that (+ any minimum-tax top-up) − foreign income tax offset − franking credits
 *
 * Franking credits are refundable (tax can go below $0). The foreign income tax offset is not: it can cancel
 * your whole year's tax (on your other income too, with the "other income" basis, including the Medicare levy),
 * but never more. With a marginal rate there's no other income to go on, so it can only cancel the investment's tax.
 * Claims up to $1,000 don't need the offset limit worked out; the limit above that isn't modelled.
 */
export function yearTax(ctx: TaxYearContext, income: YearIncome): YearTax {
  const cg = netCapitalGain(
    {
      deferredDiscountable: income.deferredDiscountableGains,
      deferredOther: income.deferredOtherGains,
      other: income.otherGains,
      indexed: income.indexedGains,
      discountable: income.discountableGains,
    },
    income.losses,
  )
  const assessable = income.distributions + income.frankingCredits + income.foreignTax + income.interest + cg.net
  let before = extraTax(ctx, assessable)
  // Minimum tax (Division 119, gains from 1 July 2027): s119-10(2). The basic tax on the minimum tax capital gain,
  // counted as your last dollars of income and before offsets (and without the Medicare levy), must be at least 30%
  // of it. The shortfall, rounded down to whole dollars (Step 6), is added.
  let topUp = 0
  if (ctx.cgtMinimumPct > 0 && cg.minimumTaxBase > 0) {
    const onGains = basicExtraTax(ctx, assessable) - basicExtraTax(ctx, assessable - cg.minimumTaxBase)
    const gap = (cg.minimumTaxBase * ctx.cgtMinimumPct) / 100 - onGains
    if (gap > 0) topUp = Math.floor(gap / 100 + 1e-6) * 100
    before += topUp
  }
  // The offset can cancel tax on your other income too (basis "income"): your whole year's tax is the limit.
  const otherTax = ctx.basis === 'income' ? incomeTax(ctx.year, ctx.otherIncome, incomeOpts(ctx)) : 0
  const fito = Math.min(income.foreignTax, before + otherTax)
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

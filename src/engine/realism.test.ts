import { describe, expect, it } from 'vitest'
import { compilePlan } from './compile'
import { runCostComparison, runManual, type ManualResult } from './manual'
import { dailyFactor, manualPath } from './path'
import { simulate } from './simulate'
import { validatePlan } from './validate'
import type { DistributionSettings, FeeSettings, Phase, Plan, Realism, TaxSettings } from './types'

let nextId = 0
function phase(p: Partial<Phase> = {}): Phase {
  return {
    id: `p${nextId++}`,
    name: 'Phase',
    duration: { count: 1, unit: 'years' },
    depositFrequency: 'none',
    deposit: { kind: 'fixed', value: 0 },
    returnRate: { kind: 'fixed', value: 0 },
    // No distributions unless a test asks for them (the app's default is a 3% yield).
    distribution: { yield: 0, frankedPct: 0, foreignPct: 0, foreignTaxPct: 15, frequency: 'yearly' },
    ...p,
  }
}

function plan(p: Partial<Plan> = {}): Plan {
  return { id: 'plan', name: 'Test', startDate: '2026-01-01', startingBalance: 0, currency: 'AUD', phases: [phase()], events: [], ...p }
}

const noBrokerage: Partial<FeeSettings> = { brokerage: { kind: 'flat', fee: 0 }, fxFeePct: 0 }
const feesOn = (f: Partial<FeeSettings> = {}): Realism => ({ fees: true, tax: false, inflation: false, feeSettings: { ...noBrokerage, ...f } as FeeSettings })
/** Tax on, worked out at a flat marginal rate with no Medicare levy, unless changed. */
const taxOn = (t: Partial<TaxSettings> = {}): Realism => ({
  fees: false,
  tax: true,
  inflation: false,
  taxSettings: { basis: 'rate', medicare: false, cgtRules: 'discount', ...t } as TaxSettings,
})
const dist = (d: Partial<DistributionSettings> = {}): DistributionSettings => ({ yield: 0, frankedPct: 0, foreignPct: 0, foreignTaxPct: 15, frequency: 'yearly', ...d })

/** What you have = what you put in (net) + growth − fees − tax − distributions taken as cash. Every year too. */
function expectAddsUp(r: ManualResult) {
  expect(r.finalBalance).toBeCloseTo(r.netContributed + r.totalGrowth - r.fees.total - r.tax.total - r.totalPaidOut, 4)
  for (const y of r.years) {
    expect(y.closing).toBeCloseTo(y.opening + y.deposits - y.withdrawals + y.growth - y.fees - y.tax - y.paidOut, 4)
  }
  for (let i = 1; i < r.years.length; i++) expect(r.years[i].opening).toBeCloseTo(r.years[i - 1].closing, 6)
  // The same in today's dollars.
  const real = r.real
  expect(r.finalReal).toBeCloseTo(real.netContributed + real.growth - real.fees - real.tax - real.paidOut, 4)
  for (const y of r.years) {
    const v = y.real
    expect(v.closing).toBeCloseTo(v.opening + v.deposits - v.withdrawals + v.growth - v.fees - v.tax - v.paidOut, 4)
    expect(v.closing).toBeCloseTo(y.closing / y.cpiClosing, 4)
  }
  for (let i = 1; i < r.years.length; i++) expect(r.years[i].real.opening).toBeCloseTo(r.years[i - 1].real.closing, 6)
}

describe('old plans and switches off', () => {
  const base = plan({
    startingBalance: 500_000,
    phases: [
      phase({ duration: { count: 3, unit: 'years' }, depositFrequency: 'weekly', deposit: { kind: 'ramp', from: 2_000, to: 9_000, shape: 'linear' }, returnRate: { kind: 'fixed', value: 7 } }),
      phase({ duration: { count: 2, unit: 'years' }, depositFrequency: 'monthly', deposit: { kind: 'fixed', value: 30_000 }, returnRate: { kind: 'ramp', from: 5, to: 9, shape: 'slowThenFast' } }),
    ],
    events: [{ id: 'e', name: 'Car', date: '2028-03-01', amount: -400_000 }],
  })

  it('a plan with every switch off (and lots of settings) gives exactly the same answer as one with no settings', () => {
    const plain = runManual(base)
    const withSettings = runManual({
      ...base,
      phases: base.phases.map((p) => ({ ...p, mer: 1, usListed: true, distribution: dist({ yield: 4, frankedPct: 100 }), otherIncome: 9_000_000, growWithInflation: true })),
      realism: { fees: false, tax: false, inflation: false, feeSettings: { brokerage: { kind: 'flat', fee: 1_000 } } as FeeSettings, taxSettings: { basis: 'income' } as TaxSettings },
    })
    expect(withSettings.finalBalance).toBe(plain.finalBalance)
    expect(withSettings.years).toEqual(plain.years)
    expect(plain.fees.total).toBe(0)
    expect(plain.tax.total).toBe(0)
    expectAddsUp(plain)
  })

  it('Tax on with a 0% rate changes nothing, even though distributions are now paid out and reinvested', () => {
    const plain = runManual(base)
    const zeroTax = runManual({ ...base, phases: base.phases.map((p) => ({ ...p, distribution: dist({ yield: 4, frequency: 'quarterly' }), marginalRate: 0 })), realism: taxOn() })
    expect(zeroTax.finalBalance).toBeCloseTo(plain.finalBalance, 4)
    expect(zeroTax.tax.distributionsReceived).toBeGreaterThan(0)
    expectAddsUp(zeroTax)
  })
})

describe('fees', () => {
  it('MER 1%: $10,000 with no growth loses 1/12 of 1% each month → $9,900.46 after a year', () => {
    const r = runManual(plan({ startingBalance: 1_000_000, phases: [phase({ mer: 1 })], realism: feesOn() }))
    // 10,000 × (1 − 0.01/12)^12
    expect(r.finalBalance).toBeCloseTo(1_000_000 * Math.pow(1 - 0.01 / 12, 12), 4)
    expect(r.fees.mer).toBeCloseTo(1_000_000 - r.finalBalance, 4)
    expectAddsUp(r)
  })

  it('MER for part of a month is charged for just that part', () => {
    // 16–31 January: 16 of January's 31 days.
    const r = runManual(plan({ startDate: '2026-01-16', startingBalance: 1_000_000, phases: [phase({ duration: { count: 16, unit: 'days' }, mer: 1.2 })], realism: feesOn() }))
    expect(r.fees.mer).toBeCloseTo(1_000_000 * (0.012 / 12) * (16 / 31), 6)
  })

  it('brokerage: $5 on each of 12 monthly $100 buys → $1,140 invested', () => {
    const r = runManual(
      plan({ phases: [phase({ depositFrequency: 'monthly', deposit: { kind: 'fixed', value: 10_000 }, mer: 0 })], realism: feesOn({ brokerage: { kind: 'flat', fee: 500 } }) }),
    )
    expect(r.finalBalance).toBe(114_000)
    expect(r.fees.brokerage).toBe(6_000)
    expectAddsUp(r)
  })

  it('buying quarterly instead: 53 weekly $100 deposits, but only 4 lots of $5 brokerage', () => {
    const r = runManual(
      plan({
        phases: [phase({ depositFrequency: 'weekly', deposit: { kind: 'fixed', value: 10_000 }, mer: 0 })],
        realism: feesOn({ brokerage: { kind: 'flat', fee: 500 }, buyFrequency: 'quarterly' }),
      }),
    )
    // Buys on 1 Jan, 1 Apr, 1 Jul, 1 Oct. Deposits after 1 Oct are still waiting as cash at the end (still yours).
    expect(r.fees.brokerage).toBe(2_000)
    expect(r.finalBalance).toBe(530_000 - 2_000)
  })

  it('waiting cash earns the cash rate: $1,000 waiting 11 months at 5% → $1,045.74', () => {
    const r = runManual(
      plan({ phases: [phase({ mer: 0 })], events: [{ id: 'e', name: 'Gift', date: '2026-02-01', amount: 100_000 }], realism: feesOn({ buyFrequency: 'yearly', cashRate: 5 }) }),
    )
    expect(r.finalBalance).toBeCloseTo(100_000 * Math.pow(1.05, 11 / 12), 4)
    expect(r.totalGrowth).toBeCloseTo(r.finalBalance - 100_000, 4)
  })

  it('a buy is put off when the brokerage would eat all the cash', () => {
    const r = runManual(
      plan({ phases: [phase({ duration: { count: 3, unit: 'months' }, depositFrequency: 'monthly', deposit: { kind: 'fixed', value: 300 }, mer: 0 })], realism: feesOn({ brokerage: { kind: 'flat', fee: 500 } }) }),
    )
    // Month 1: $3 waits (not more than $5). Month 2: $6 → buys, $5 brokerage, $1 invested. Month 3: $3 waits.
    expect(r.fees.brokerage).toBe(500)
    expect(r.finalBalance).toBe(900 - 500)
    expect(r.warnings.join(' ')).toMatch(/put off/)
  })

  it('currency fee 0.5% on a US-listed ETF, on the buy and on a withdrawal', () => {
    const r = runManual(
      plan({
        phases: [phase({ usListed: true, mer: 0 })],
        events: [
          { id: 'a', name: 'In', date: '2026-01-01', amount: 1_000_000 },
          { id: 'b', name: 'Out', date: '2026-06-01', amount: -500_000 },
        ],
        realism: feesOn({ fxFeePct: 0.5 }),
      }),
    )
    // Buy: $10,000 → $9,950 invested ($50 fee). Withdraw $5,000: sell $5,025.13 so that after 0.5% you get $5,000.
    const gross = 500_000 / 0.995
    expect(r.fees.currency).toBeCloseTo(5_000 + (gross - 500_000), 4)
    expect(r.finalBalance).toBeCloseTo(995_000 - gross, 4)
    expect(r.totalWithdrawn).toBeCloseTo(500_000, 6)
    expectAddsUp(r)
  })

  it('buy/sell spread 0.1%: $10,000 in → $9,990 invested', () => {
    const r = runManual(plan({ phases: [phase({ mer: 0 })], events: [{ id: 'a', name: 'In', date: '2026-01-01', amount: 1_000_000 }], realism: feesOn({ spreadPct: 0.1 }) }))
    expect(r.finalBalance).toBeCloseTo(999_000, 6)
    expect(r.fees.spread).toBeCloseTo(1_000, 6)
  })

  it('platform fee: $10 a month for a year is $120; $120 a year is split across the two financial years', () => {
    const monthly = runManual(plan({ startingBalance: 1_000_000, phases: [phase({ mer: 0 })], realism: feesOn({ platformFee: 1_000, platformFeePer: 'month' }) }))
    expect(monthly.fees.platform).toBeCloseTo(12_000, 6)
    expect(monthly.finalBalance).toBeCloseTo(1_000_000 - 12_000, 6)
    const yearly = runManual(plan({ startingBalance: 1_000_000, phases: [phase({ mer: 0 })], realism: feesOn({ platformFee: 12_000, platformFeePer: 'year' }) }))
    // 1 Jan–30 Jun 2026 is 181 of 365 days of 2025–26; 1 Jul–31 Dec 2026 is 184 of 365 days of 2026–27.
    expect(yearly.years[0].fees).toBeCloseTo((12_000 * 181) / 365, 6)
    expect(yearly.years[1].fees).toBeCloseTo((12_000 * 184) / 365, 6)
    expectAddsUp(yearly)
  })
})

describe('tax on distributions', () => {
  // $10,000 from 1 July 2026 for a year. Total return 4%, all of it paid as one distribution on 30 June 2027 → $400.
  const yearOfIncome = (p: Partial<Phase>, t: Partial<TaxSettings> = {}, startingBalance = 1_000_000) =>
    runManual(
      plan({
        startDate: '2026-07-01',
        startingBalance,
        phases: [phase({ returnRate: { kind: 'fixed', value: 4 }, distribution: dist({ yield: 4 }), marginalRate: 30, ...p })],
        realism: taxOn(t),
      }),
    )

  it('$400 unfranked at 30%: $120 tax, $280 reinvested → $10,280', () => {
    const r = yearOfIncome({})
    expect(r.tax.distributionsReceived).toBeCloseTo(40_000, 4)
    expect(r.tax.total).toBeCloseTo(12_000, 4)
    expect(r.finalBalance).toBeCloseTo(1_028_000, 4)
    expectAddsUp(r)
  })

  it('fully franked at 30%: the $171.43 credit covers the tax exactly → $10,400', () => {
    const r = yearOfIncome({ distribution: dist({ yield: 4, frankedPct: 100 }) })
    expect(r.tax.frankingCredits).toBeCloseTo((40_000 * 30) / 70, 4)
    expect(r.tax.total).toBeCloseTo(0, 4)
    expect(r.finalBalance).toBeCloseTo(1_040_000, 4)
  })

  it('fully franked at 45% + 2% Medicare: 47% of $571.43 − $171.43 = $97.14', () => {
    const r = yearOfIncome({ distribution: dist({ yield: 4, frankedPct: 100 }), marginalRate: 45 }, { medicare: true })
    expect(r.tax.total).toBeCloseTo(0.47 * (40_000 / 0.7) - 40_000 * (3 / 7), 4)
  })

  it('fully franked at 0%: the franking credit is refunded and reinvested → $10,571.43', () => {
    const r = yearOfIncome({ distribution: dist({ yield: 4, frankedPct: 100 }), marginalRate: 0 })
    expect(r.tax.total).toBeCloseTo(-40_000 * (3 / 7), 4)
    expect(r.finalBalance).toBeCloseTo(1_040_000 + 40_000 * (3 / 7), 4)
  })

  it('taking distributions as cash: $280 is paid to you and the investment stays at $10,000', () => {
    const r = yearOfIncome({}, { distributions: 'cash' })
    expect(r.totalPaidOut).toBeCloseTo(28_000, 4)
    expect(r.finalBalance).toBeCloseTo(1_000_000, 4)
    expectAddsUp(r)
  })

  it('US ETF: $400 received after 15% US tax; you pay 30% of $470.59 less the $70.59 offset', () => {
    const r = yearOfIncome({ distribution: dist({ yield: 4, foreignPct: 100, foreignTaxPct: 15 }) })
    const grossed = 40_000 / 0.85
    expect(r.tax.total).toBeCloseTo(0.3 * grossed - (grossed - 40_000), 4)
    expect(r.tax.foreignTaxOffset).toBeCloseTo(grossed - 40_000, 4)
  })

  it('income basis: no tax on $400 when your other income is $0 (under the tax-free threshold)', () => {
    expect(yearOfIncome({ otherIncome: 0 }, { basis: 'income', medicare: true }).tax.total).toBeCloseTo(0, 6)
  })

  it('"brackets rise with inflation": the second year is taxed at 21% instead of 33.5%', () => {
    // $48,000 other income from 1 July 2027 (2027–28 rates), 10% inflation. In 2028–29 the thresholds are 10% higher.
    const run = (brackets: 'fixed' | 'indexed') =>
      runManual(
        plan({
          startDate: '2027-07-01',
          startingBalance: 1_000_000,
          phases: [phase({ duration: { count: 2, unit: 'years' }, returnRate: { kind: 'fixed', value: 4 }, distribution: dist({ yield: 4 }), otherIncome: 4_800_000 })],
          realism: { ...taxOn({ basis: 'income', medicare: true, brackets }), inflationSettings: { rate: { kind: 'fixed', value: 10 } } },
        }),
      )
    const fixed = run('fixed')
    const indexed = run('indexed')
    // Year 1 (both): $400 at 30% + 1.5% LITO taper + 2% Medicare = $134. Year 2: $10,266 × 4% = $410.64.
    expect(fixed.years[0].tax).toBeCloseTo(13_400, 4)
    expect(indexed.years[0].tax).toBeCloseTo(13_400, 4)
    expect(fixed.years[1].tax).toBeCloseTo(0.335 * 41_064, 4)
    expect(indexed.years[1].tax).toBeCloseTo(0.21 * 41_064, 4)
  })
})

describe('capital gains tax', () => {
  const growThenSell = (months: number, extraDays = 0, t: Partial<TaxSettings> = {}) =>
    runManual(
      plan({
        startDate: '2030-01-01',
        startingBalance: 1_000_000,
        phases: [
          phase({ duration: { count: months, unit: 'months' }, returnRate: { kind: 'fixed', value: 10 }, marginalRate: 30 }),
          ...(extraDays ? [phase({ duration: { count: extraDays, unit: 'days' }, marginalRate: 30 })] : []),
        ],
        realism: taxOn({ atEnd: 'sell', ...t }),
      }),
    )

  it('held 2 years: $2,100 gain, halved by the 50% discount, taxed at 30% = $315 → $11,785 after tax', () => {
    const r = growThenSell(24)
    expect(r.endSale?.marketValue).toBeCloseTo(1_210_000, 4)
    expect(r.endSale?.tax).toBeCloseTo(31_500, 4)
    expect(r.finalBalance).toBeCloseTo(1_178_500, 4)
    expectAddsUp(r)
  })

  it('held 6 months: no discount', () => {
    const r = growThenSell(6)
    expect(r.tax.total).toBeCloseTo(0.3 * (1_000_000 * Math.sqrt(1.1) - 1_000_000), 4)
  })

  it('the 12 months don’t count the day you buy or the day you sell', () => {
    // Bought 1 Jan 2030. Sold 1 Jan 2031: only 364 days in between → no discount. Sold 2 Jan 2031 → discount.
    const gain = 1_000_000 * 0.1
    expect(growThenSell(12, 1).tax.total).toBeCloseTo(0.3 * gain, 4)
    expect(growThenSell(12, 2).tax.total).toBeCloseTo(0.3 * gain * 0.5, 4)
  })

  it('"don’t sell" shows the tax you would owe, and leaves the balance alone', () => {
    const hold = growThenSell(24, 0, { atEnd: 'hold' })
    expect(hold.finalBalance).toBeCloseTo(1_210_000, 4)
    expect(hold.tax.total).toBe(0)
    expect(hold.endSale?.tax).toBeCloseTo(31_500, 4)
    expect(hold.endSale?.afterTax).toBeCloseTo(1_178_500, 4)
  })

  it('each purchase is its own lot, sold oldest first; selling for tax adds a little more gain', () => {
    // Lot A: $1,000 on 1 Jan 2030. Lot B: $1,000 on 1 Jul 2030. From 1 Jul 2030 the price grows 21% a year.
    // On 1 Mar 2031 (8 months later, price p) $1,500 is withdrawn: all of A (long-term) and part of B (short-term).
    const r = runManual(
      plan({
        startDate: '2030-01-01',
        startingBalance: 100_000,
        phases: [phase({ duration: { count: 6, unit: 'months' }, marginalRate: 30 }), phase({ duration: { count: 9, unit: 'months' }, returnRate: { kind: 'fixed', value: 21 }, marginalRate: 30 })],
        events: [
          { id: 'b', name: 'Lot B', date: '2030-07-01', amount: 100_000 },
          { id: 'w', name: 'Out', date: '2031-03-01', amount: -150_000 },
        ],
        realism: taxOn(),
      }),
    )
    const p = Math.pow(1.21, 8 / 12)
    const gainA = 100_000 * p - 100_000
    const gainB = (150_000 - 100_000 * p) * (1 - 1 / p)
    // The tax is paid by selling more of lot B, which is itself a short-term gain of (1 − 1/p) per dollar sold, and so on.
    const tax = (0.3 * (0.5 * gainA + gainB)) / (1 - 0.3 * (1 - 1 / p))
    expect(r.tax.total).toBeCloseTo(tax, 2)
    expectAddsUp(r)
  })

  it('a capital loss is carried forward and reduces a later year’s gain', () => {
    // $10,000 halves by 1 Jul 2030; $2,500 is withdrawn (a $2,500 loss in 2030–31). The rest goes from $5,000 to $10,000
    // by 30 Jun 2032 and is sold: a $5,000 gain − $2,500 loss, halved = $1,250, at 30% = $375.
    const r = runManual(
      plan({
        startDate: '2030-01-01',
        startingBalance: 1_000_000,
        phases: [
          phase({ duration: { count: 6, unit: 'months' }, returnRate: { kind: 'fixed', value: -75 }, marginalRate: 30 }),
          phase({ duration: { count: 1, unit: 'years' }, marginalRate: 30 }),
          phase({ duration: { count: 1, unit: 'years' }, returnRate: { kind: 'fixed', value: 300 }, marginalRate: 30 }),
        ],
        events: [{ id: 'w', name: 'Out', date: '2030-07-01', amount: -250_000 }],
        realism: taxOn({ atEnd: 'sell' }),
      }),
    )
    expect(r.years.find((y) => y.fy === 2031)?.tax).toBeCloseTo(0, 6)
    expect(r.tax.total).toBeCloseTo(37_500, 4)
    expect(r.finalBalance).toBeCloseTo(1_000_000 - 37_500, 4)
  })

  it('from 1 July 2027 (now law): gain up to then gets the 50% discount, gain after uses an inflation-indexed cost base', () => {
    // $10,000 on 1 Jan 2027 grows 10% by 1 Jul 2027 (→ $11,000), then 10% a year for 2 years (→ $13,310), with 5% inflation.
    const run = (rate: number, minimum: boolean) =>
      runManual(
        plan({
          startDate: '2027-01-01',
          startingBalance: 1_000_000,
          phases: [
            phase({ duration: { count: 6, unit: 'months' }, returnRate: { kind: 'fixed', value: 21 }, marginalRate: rate }),
            phase({ duration: { count: 2, unit: 'years' }, returnRate: { kind: 'fixed', value: 10 }, marginalRate: rate }),
          ],
          realism: { ...taxOn({ atEnd: 'sell', cgtRules: 'law', cgtMinimum: minimum }), inflationSettings: { rate: { kind: 'fixed', value: 5 } } },
        }),
      )
    // Sold on 30 Jun 2029. Prices then (start of that day) vs 1 Jul 2027: 23 months + 29 days of June's 30 at 5% a year.
    const indexRatio = Math.pow(1.05, 23 / 12 + 29 / 360)
    const indexedGain = 1_331_000 - 1_100_000 * indexRatio
    const preGain = 100_000
    expect(run(30, true).tax.total).toBeCloseTo(0.3 * (0.5 * preGain + indexedGain), 2)
    // At a 10% rate, the minimum 30% tax applies to the indexed part.
    expect(run(10, true).tax.total).toBeCloseTo(0.1 * 0.5 * preGain + 0.3 * indexedGain, 2)
    expect(run(10, false).tax.total).toBeCloseTo(0.1 * (0.5 * preGain + indexedGain), 2)
  })

  it('"keep the 50% discount" ignores the 2027 change', () => {
    const r = runManual(
      plan({
        startDate: '2028-01-01',
        startingBalance: 1_000_000,
        phases: [phase({ duration: { count: 2, unit: 'years' }, returnRate: { kind: 'fixed', value: 10 }, marginalRate: 30 })],
        realism: taxOn({ atEnd: 'sell', cgtRules: 'discount' }),
      }),
    )
    expect(r.tax.total).toBeCloseTo(0.3 * 0.5 * 210_000, 4)
  })
})

describe('under-18 rules', () => {
  const minor = (startingBalance: number, t: Partial<TaxSettings>) =>
    runManual(
      plan({
        startDate: '2026-07-01',
        startingBalance,
        phases: [phase({ returnRate: { kind: 'fixed', value: 4 }, distribution: dist({ yield: 4 }) })],
        realism: taxOn({ basis: 'income', medicare: true, owner: 'minor', minorMoney: 'family', turns18On: '2035-01-01', ...t }),
      }),
    )

  it('$1,000 of distributions from family money: 66% of the amount over $416 = $385.44', () => {
    expect(minor(2_500_000, {}).tax.total).toBeCloseTo(38_544, 4)
  })

  it('$2,000: 45% of the whole amount = $900', () => {
    expect(minor(5_000_000, {}).tax.total).toBeCloseTo(90_000, 4)
  })

  it('money from their own job is "excepted income": normal adult rates, so no tax on $2,000', () => {
    expect(minor(5_000_000, { minorMoney: 'own' }).tax.total).toBeCloseTo(0, 6)
  })

  it('the rules depend on age at 30 June: 18 by then → adult rates; 18 on 1 July → still under 18', () => {
    expect(minor(2_500_000, { turns18On: '2027-06-30' }).tax.total).toBeCloseTo(0, 6)
    expect(minor(2_500_000, { turns18On: '2027-07-01' }).tax.total).toBeCloseTo(38_544, 4)
  })
})

describe('inflation', () => {
  it('today’s dollars: $10,000 with no growth and 3% inflation for 10 years is worth $7,440.94 in today’s money', () => {
    const r = runManual(plan({ startingBalance: 1_000_000, phases: [phase({ duration: { count: 10, unit: 'years' } })], realism: { fees: false, tax: false, inflation: true, inflationSettings: { rate: { kind: 'fixed', value: 3 } } } }))
    expect(r.finalBalance).toBe(1_000_000)
    expect(r.finalReal).toBeCloseTo(1_000_000 / Math.pow(1.03, 10), 4)
    expect(r.real.growth).toBeCloseTo(r.finalReal - 1_000_000, 4) // the loss to inflation
  })

  it('grow deposits with inflation: each monthly $100 rises with prices from the phase start', () => {
    const p = (grow: boolean, on: boolean) =>
      runManual(
        plan({
          phases: [phase({ duration: { count: 2, unit: 'years' }, depositFrequency: 'monthly', deposit: { kind: 'fixed', value: 10_000 }, growWithInflation: grow })],
          realism: { fees: false, tax: false, inflation: on, inflationSettings: { rate: { kind: 'fixed', value: 12 } } },
        }),
      )
    let expected = 0
    for (let k = 0; k < 24; k++) expected += Math.round(10_000 * Math.pow(1.12, k / 12))
    const r = p(true, true)
    expect(r.phases[0].firstDeposit).toBe(10_000)
    expect(r.phases[0].lastDeposit).toBe(Math.round(10_000 * Math.pow(1.12, 23 / 12)))
    expect(r.totalDeposited).toBe(expected)
    // Only when the Inflation switch is on.
    expect(p(true, false).totalDeposited).toBe(240_000)
  })

  it('a ramp from 2% to 4%', () => {
    const r = runManual(
      plan({ startingBalance: 100_000, phases: [phase({ duration: { count: 4, unit: 'years' } })], realism: { fees: false, tax: false, inflation: true, inflationSettings: { rate: { kind: 'ramp', from: 2, to: 4, shape: 'linear' } } } }),
    )
    expect(r.cpiEnd).toBeGreaterThan(Math.pow(1.02, 4))
    expect(r.cpiEnd).toBeLessThan(Math.pow(1.04, 4))
  })

  it('with Inflation on, the goal is checked in today’s dollars', () => {
    const r = runManual(
      plan({ startingBalance: 1_000_000, phases: [phase({ duration: { count: 5, unit: 'years' } })], goal: { amount: 1_000_000, date: '2030-12-31' }, realism: { fees: false, tax: false, inflation: true } }),
    )
    expect(r.goal?.reached).toBe(false)
    expect(r.goal?.inTodaysDollars).toBe(true)
  })
})

describe('show the cost', () => {
  it('all off, then fees, tax and inflation each take their share, adding up to the real result', () => {
    const p = plan({
      startDate: '2026-07-01',
      startingBalance: 1_000_000,
      phases: [phase({ duration: { count: 20, unit: 'years' }, depositFrequency: 'monthly', deposit: { kind: 'fixed', value: 50_000 }, returnRate: { kind: 'fixed', value: 7 }, mer: 0.2, distribution: dist({ yield: 3, frankedPct: 30 }), otherIncome: 8_000_000 })],
      realism: { fees: true, tax: true, inflation: true, taxSettings: { basis: 'income', atEnd: 'sell' } as TaxSettings },
    })
    const cmp = runCostComparison(p)
    expect(cmp.steps.map((s) => s.switch)).toEqual(['fees', 'tax', 'inflation'])
    for (const s of cmp.steps) expect(s.cost).toBeGreaterThan(0)
    const totalCost = cmp.steps.reduce((a, s) => a + s.cost, 0)
    expect(cmp.allOff.finalBalance - totalCost).toBeCloseTo(cmp.actual.finalReal, 4)
    expect(cmp.actual.finalBalance).toBeCloseTo(runManual(p).finalBalance, 6)
    expectAddsUp(cmp.actual)
  })
})

describe('everything on at once still adds up', () => {
  it('fees, tax, withdrawals, cash distributions and a sale at the end', () => {
    const r = runManual(
      plan({
        startDate: '2026-10-18',
        startingBalance: 300_000,
        phases: [
          phase({ duration: { count: 3, unit: 'years' }, depositFrequency: 'weekly', deposit: { kind: 'fixed', value: 5_000 }, returnRate: { kind: 'fixed', value: 8 }, usListed: true, distribution: dist({ yield: 2, foreignPct: 100, frequency: 'quarterly' }) }),
          phase({ duration: { count: 5, unit: 'years' }, depositFrequency: 'monthly', deposit: { kind: 'ramp', from: 20_000, to: 60_000, shape: 'linear' }, returnRate: { kind: 'fixed', value: -5 }, distribution: dist({ yield: 4, frankedPct: 80 }), otherIncome: 6_000_000, growWithInflation: true }),
        ],
        events: [
          { id: 'a', name: 'Car', date: '2030-03-01', amount: -500_000 },
          { id: 'b', name: 'Gift', date: '2031-01-05', amount: 200_000 },
        ],
        realism: {
          fees: true,
          tax: true,
          inflation: true,
          feeSettings: { brokerage: { kind: 'percent', pct: 0.1, min: 300 }, buyFrequency: 'monthly', cashRate: 4, fxFeePct: 0.6, platformFee: 200, platformFeePer: 'month', spreadPct: 0.05 } as FeeSettings,
          taxSettings: { basis: 'income', distributions: 'cash', atEnd: 'sell' } as TaxSettings,
        },
      }),
    )
    expectAddsUp(r)
    expect(r.fees.total).toBeGreaterThan(0)
    expect(r.endSale?.mode).toBe('sell')
  })
})

describe('checking the new settings', () => {
  it('catches impossible fee, tax and inflation settings', () => {
    expect(validatePlan(plan({ phases: [phase({ mer: -1 })] }))).not.toHaveLength(0)
    expect(validatePlan(plan({ phases: [phase({ distribution: dist({ frankedPct: 120 }) })] }))).not.toHaveLength(0)
    expect(validatePlan(plan({ realism: { ...feesOn({ brokerage: { kind: 'flat', fee: -5 } }) } }))).not.toHaveLength(0)
    expect(validatePlan(plan({ realism: { fees: false, tax: false, inflation: true, inflationSettings: { rate: { kind: 'fixed', value: -100 } } } }))).not.toHaveLength(0)
    expect(validatePlan(plan({ realism: feesOn() }))).toHaveLength(0)
  })
})

describe('speed (for Prediction mode)', () => {
  it('runs a 40-year plan with every switch on 200 times in well under the time 2,000 runs can take in a worker', () => {
    const p = plan({
      phases: [phase({ duration: { count: 4, unit: 'decades' }, depositFrequency: 'weekly', deposit: { kind: 'fixed', value: 10_000 }, returnRate: { kind: 'fixed', value: 7 }, distribution: dist({ yield: 3, frankedPct: 50, frequency: 'quarterly' }) })],
      realism: { fees: true, tax: true, inflation: true, feeSettings: { buyFrequency: 'monthly' } as FeeSettings, taxSettings: { basis: 'income' } as TaxSettings },
    })
    const c = compilePlan(p)
    const path = manualPath(c)
    const t = performance.now()
    for (let i = 0; i < 200; i++) simulate(c, path, { detail: false })
    const per = (performance.now() - t) / 200
    expect(per).toBeLessThan(15) // ms per run → 2,000 runs in under 30 s even on a slow phone; usually far less
  })

  it('a sampled path plugs in the same way: monthly returns become daily factors', () => {
    const p = plan({ startingBalance: 1_000_000, phases: [phase({ duration: { count: 2, unit: 'months' } })] })
    const c = compilePlan(p)
    const growth = new Float64Array(c.n)
    for (let t = 0; t < c.n; t++) growth[t] = Math.pow(t < 31 ? 1.1 : 0.95, 1 / c.dim[t]) // +10% in Jan, −5% in Feb
    const r = simulate(c, { growth, inflation: new Float64Array(c.n).fill(dailyFactor(0, 31)), warnings: [] })
    expect(r.finalBalance).toBeCloseTo(1_000_000 * 1.1 * 0.95, 4)
  })
})

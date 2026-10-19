// "Money you have now": hand-worked checks for holdings, their tax lots, Keep vs Move, pro-rata withdrawals and
// Prediction mode. Money is in cents.

import { describe, expect, it } from 'vitest'
import { CASH_KEY, etfKey, etfsUsed, usesCash } from './assets'
import { compilePlan } from './compile'
import { hasSeparateHoldings, keptHoldings, sameInvestment, startingTotal } from './holdings'
import { runCostComparison, runManual } from './manual'
import { buildPath, preparePrediction, runPrediction, sampledMonths, type HistoryTable } from './prediction'
import type { Switches } from './simulate'
import type { Holding, Phase, Plan, Realism, StartingMoney, TaxSettings } from './types'
import { startingMoneyProblems, validatePlan } from './validate'

let nextId = 0
function phase(p: Partial<Phase> = {}): Phase {
  return {
    id: `p${nextId++}`,
    name: 'Phase',
    duration: { count: 1, unit: 'years' },
    depositFrequency: 'none',
    deposit: { kind: 'fixed', value: 0 },
    returnRate: { kind: 'fixed', value: 10 },
    investment: { kind: 'etf', etf: 'AAA' },
    mer: 0,
    distribution: { yield: 0, frankedPct: 0, foreignPct: 0, foreignTaxPct: 15, frequency: 'quarterly' },
    ...p,
  }
}

function plan(p: Partial<Plan> = {}): Plan {
  return { id: 'plan', name: 'Test', startDate: '2026-01-01', startingBalance: 1_000_000, currency: 'AUD', phases: [phase()], events: [], ...p }
}

const holding = (h: Partial<Holding> & { value: number }): Holding => ({ id: `h${nextId++}`, ...h })

/** Tax at a flat 30% (no Medicare levy), so the capital gains tax is easy to work out by hand. */
const flatTax = (t: Partial<TaxSettings> = {}): Realism => ({
  fees: false,
  tax: true,
  inflation: false,
  taxSettings: { basis: 'rate', medicare: false, brackets: 'fixed', distributions: 'reinvest', atEnd: 'sell', owner: 'adult', minorMoney: 'family', cgtRules: 'law', cgtMinimum: false, ...t },
  inflationSettings: { rate: { kind: 'fixed', value: 0 } },
})
const rate30 = (p: Partial<Phase> = {}) => phase({ marginalRate: 30, ...p })

const ALL_SWITCHES: Switches[] = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ fees: !!(i & 1), tax: !!(i & 2), inflation: !!(i & 4) }))

const everything: Realism = {
  fees: true,
  tax: true,
  inflation: true,
  feeSettings: { brokerage: { kind: 'flat', fee: 500 }, buyFrequency: 'monthly', cashRate: 1, fxFeePct: 0.5, platformFee: 200, platformFeePer: 'month', spreadPct: 0.1 },
  taxSettings: { basis: 'income', medicare: true, brackets: 'indexed', distributions: 'reinvest', atEnd: 'sell', owner: 'adult', minorMoney: 'family', cgtRules: 'law', cgtMinimum: true },
  inflationSettings: { rate: { kind: 'fixed', value: 2.5 } },
}

describe('plans without the new details give exactly the same results', () => {
  const base = plan({
    realism: everything,
    goal: { amount: 3_000_000, date: '2034-01-01' },
    events: [
      { id: 'e1', name: 'Gift', date: '2028-07-01', amount: 300_000 },
      { id: 'e2', name: 'Car', date: '2031-02-10', amount: -800_000 },
    ],
    phases: [
      phase({ duration: { count: 5, unit: 'years' }, depositFrequency: 'monthly', deposit: { kind: 'fixed', value: 50_000 }, mer: 0.2, otherIncome: 6_000_000, distribution: { yield: 3, frankedPct: 70, foreignPct: 0, foreignTaxPct: 15, frequency: 'quarterly' } }),
      phase({ investment: { kind: 'cash', rate: 4 }, duration: { count: 3, unit: 'years' }, depositFrequency: 'weekly', deposit: { kind: 'fixed', value: 5_000 } }),
    ],
  })
  const variants: [string, StartingMoney][] = [
    ['one amount, nothing filled in', { entry: 'single' }],
    ['one amount, empty details', { entry: 'single', single: {} }],
    ['one amount, same as the first phase, bought today for its value', { entry: 'single', single: { costBase: 1_000_000, boughtOn: '2026-01-01' } }],
    ['one amount in the same ETF as the first phase', { entry: 'single', single: { investment: { kind: 'etf', etf: 'AAA' } } }],
    ['one holding with the same value', { entry: 'holdings', holdings: [holding({ value: 1_000_000 })] }],
    ['"move" with nothing different', { entry: 'single', handling: 'move' }],
  ]
  for (const [name, startingMoney] of variants) {
    it(`${name}: identical in every switch combination`, () => {
      for (const sw of ALL_SWITCHES) expect(runManual({ ...base, startingMoney }, sw)).toStrictEqual(runManual(base, sw))
      expect(runCostComparison({ ...base, startingMoney })).toStrictEqual(runCostComparison(base))
    })
  }
})

describe('one amount in a different investment, kept separately', () => {
  // Start 1 Jan 2026. $10,000 in a savings account at 4%; the plan's phase is an ETF at 7% with $100 on the 1st of
  // every month for 2 years. All switches off.
  //   savings:  $10,000 × 1.04² = $10,816 exactly
  //   deposits: each $100 grows for the whole months left: $100 × (q + q² + … + q²⁴), q = 1.07^(1/12)
  const p = plan({
    phases: [phase({ duration: { count: 2, unit: 'years' }, depositFrequency: 'monthly', deposit: { kind: 'fixed', value: 10_000 }, returnRate: { kind: 'fixed', value: 7 } })],
    startingMoney: { entry: 'single', single: { investment: { kind: 'cash', rate: 4 } } },
  })
  const q = Math.pow(1.07, 1 / 12)
  const deposits = (10_000 * q * (Math.pow(q, 24) - 1)) / (q - 1)

  it('grows each part at its own rate (closed form)', () => {
    const r = runManual(p)
    expect(1_000_000 * 1.04 ** 2).toBeCloseTo(1_081_600, 6)
    expect(deposits).toBeCloseTo(257_721.15, 1) // $2,577.21
    expect(r.finalBalance).toBeCloseTo(1_081_600 + deposits, 4) // $13,393.21
    expect(r.startingBalance).toBe(1_000_000)
    expect(r.totalDeposited).toBe(240_000)
    // "Keep" is the default; the same money in the first phase's ETF would grow at 7% instead.
    const same = runManual({ ...p, startingMoney: undefined })
    expect(same.finalBalance).toBeCloseTo(1_000_000 * 1.07 ** 2 + deposits, 4)
  })

  it('a kept ETF holding uses its own expected return', () => {
    const etf = runManual({ ...p, startingMoney: { entry: 'single', single: { investment: { kind: 'etf', etf: 'BBB' }, returnRate: 9 } } })
    expect(etf.finalBalance).toBeCloseTo(1_000_000 * 1.09 ** 2 + deposits, 4)
  })

  it('knows which holdings are separate', () => {
    expect(keptHoldings(p)).toHaveLength(1)
    expect(hasSeparateHoldings(p)).toBe(true)
    expect(usesCash(p)).toBe(true)
    expect(etfsUsed({ ...p, startingMoney: { entry: 'single', single: { investment: { kind: 'etf', etf: 'BBB' } } } })).toEqual(['AAA', 'BBB'])
    expect(keptHoldings({ ...p, startingMoney: { ...p.startingMoney!, handling: 'move' } })).toHaveLength(0)
    expect(sameInvestment({ kind: 'etf', etf: 'AAA' }, { kind: 'etf', etf: 'AAA' })).toBe(true)
    expect(sameInvestment({ kind: 'cash', rate: 4 }, { kind: 'cash', rate: 5 })).toBe(false)
  })

  it('pays its own fee and its own distributions', () => {
    // $10,000 kept in ETF BBB growing 0% with a 1% fee: 12 month-ends of 1/12 of 1% → $10,000 × (1 − 0.01/12)¹² = $9,900.46.
    const fee = plan({
      startDate: '2025-07-01',
      phases: [phase({ returnRate: { kind: 'fixed', value: 0 } })],
      realism: { fees: true, tax: false, inflation: false },
      startingMoney: { entry: 'single', single: { investment: { kind: 'etf', etf: 'BBB' }, returnRate: 0, mer: 1 } },
    })
    const r = runManual(fee)
    expect(r.fees.mer).toBeCloseTo(1_000_000 - 990_045.9, 0)
    expect(r.finalBalance).toBeCloseTo(990_045.9, 0)

    // $10,000 kept in BBB growing 4% a year, all of it a yearly 100%-franked distribution, taxed at 0%:
    // $400 paid on 30 June 2026, franking credit $400 × 30/70 = $171.43 refunded and reinvested → $10,571.43.
    const div = plan({
      startDate: '2025-07-01',
      phases: [phase({ marginalRate: 0 })],
      realism: { ...flatTax({ atEnd: 'hold' }) },
      startingMoney: {
        entry: 'single',
        single: { investment: { kind: 'etf', etf: 'BBB' }, returnRate: 4, distribution: { yield: 4, frankedPct: 100, foreignPct: 0, foreignTaxPct: 15, frequency: 'yearly' } },
      },
    })
    const d = runManual(div)
    expect(d.tax.distributionsReceived).toBeCloseTo(40_000, 4)
    expect(d.tax.frankingCredits).toBeCloseTo((40_000 * 30) / 70, 4)
    expect(d.tax.total).toBeCloseTo(-17_142.857, 2)
    expect(d.finalBalance).toBeCloseTo(1_057_142.86, 1)
  })
})

describe('tax lots with a real cost base and purchase date', () => {
  // A flat 30% tax rate, no Medicare levy, no distributions, 10% a year growth, "sell everything at the end".
  it('bought 3 years before the plan: the 50% discount applies', () => {
    // Plan 1 Jul 2025 – 30 Jun 2026. $10,000 now, paid $6,000 on 1 Jul 2022.
    // Sold for $11,000 on 30 Jun 2026: gain $5,000, held over 12 months → taxable $2,500 × 30% = $750. Left: $10,250.
    const p = plan({
      startDate: '2025-07-01',
      phases: [rate30()],
      realism: flatTax(),
      startingMoney: { entry: 'single', single: { costBase: 600_000, boughtOn: '2022-07-01' } },
    })
    const r = runManual(p)
    expect(r.endSale!.marketValue).toBeCloseTo(1_100_000, 4)
    expect(r.tax.netCapitalGains).toBeCloseTo(250_000, 4)
    expect(r.tax.total).toBeCloseTo(75_000, 4)
    expect(r.finalBalance).toBeCloseTo(1_025_000, 4)
    // Without the details (bought today for $10,000): gain $1,000, held under 12 months → $300.
    expect(runManual({ ...p, startingMoney: undefined }).tax.total).toBeCloseTo(30_000, 4)
  })

  it('bought 6 months before the plan and sold 3 months in: no discount', () => {
    // Plan 1 Jul – 30 Sep 2025. Paid $6,000 on 15 Jan 2025; worth $10,000 × 1.1^(3/12) = $10,241.14 when sold.
    // Held 8½ months → the whole gain $4,241.14 is taxed: 30% = $1,272.34.
    const p = plan({
      startDate: '2025-07-01',
      phases: [rate30({ duration: { count: 3, unit: 'months' } })],
      realism: flatTax(),
      startingMoney: { entry: 'single', single: { costBase: 600_000, boughtOn: '2025-01-15' } },
    })
    const value = 1_000_000 * Math.pow(1.1, 3 / 12)
    const r = runManual(p)
    expect(value).toBeCloseTo(1_024_113.69, 1)
    expect(r.tax.total).toBeCloseTo(0.3 * (value - 600_000), 4) // $1,272.34
    // Bought 1 Sep 2024 instead: held over 12 months → half the gain is taxed.
    const older = runManual({ ...p, startingMoney: { entry: 'single', single: { costBase: 600_000, boughtOn: '2024-09-01' } } })
    expect(older.tax.total).toBeCloseTo(0.3 * 0.5 * (value - 600_000), 4) // $636.17
  })

  it('owned before 1 July 2027 and sold in 2029: the gain is split there', () => {
    // Plan 1 Jul 2026 – 30 Jun 2029, inflation 0% (so indexing the cost base changes nothing), no minimum tax.
    // Paid $6,000 on 1 Jul 2023; worth $10,000 at the start, $11,000 on 30 June 2027, $13,310 when sold.
    //   gain up to 30 June 2027: $5,000, held over 12 months → $2,500 taxable
    //   gain after: $13,310 − $11,000 = $2,310, taxed in full (indexed cost base = $11,000)
    //   tax: 30% × $4,810 = $1,443, all in 2028–29. Left: $11,867.
    const p = plan({
      startDate: '2026-07-01',
      phases: [rate30({ duration: { count: 3, unit: 'years' } })],
      realism: flatTax(),
      startingMoney: { entry: 'single', single: { costBase: 600_000, boughtOn: '2023-07-01' } },
    })
    const r = runManual(p)
    expect(r.endSale!.marketValue).toBeCloseTo(1_331_000, 3)
    expect(r.tax.netCapitalGains).toBeCloseTo(481_000, 3)
    expect(r.years.map((y) => Math.round(y.tax))).toEqual([0, 0, 144_300])
    expect(r.finalBalance).toBeCloseTo(1_186_700, 3)
  })

  it('a plan starting after 1 July 2027 estimates the value on that day', () => {
    // Plan 1 Jul 2028 – 30 Jun 2029, 0% growth. Paid $6,000 on 1 Jul 2026, worth $10,000 at the start.
    // Value on 1 July 2027 (365 of the 731 days from purchase to start), steady growth: $6,000 × (10/6)^(365/731).
    const p = plan({
      startDate: '2028-07-01',
      phases: [rate30({ returnRate: { kind: 'fixed', value: 0 } })],
      realism: flatTax(),
      startingMoney: { entry: 'single', single: { costBase: 600_000, boughtOn: '2026-07-01' } },
    })
    const atJuly2027 = 600_000 * Math.pow(10 / 6, 365 / 731)
    const r = runManual(p)
    expect(atJuly2027).toBeCloseTo(774_326.07, 1)
    expect(r.tax.netCapitalGains).toBeCloseTo(0.5 * (atJuly2027 - 600_000) + (1_000_000 - atJuly2027), 3)
    expect(r.warnings.some((w) => w.includes('estimated as steady growth'))).toBe(true)
  })

  it('kept holdings and holdings in the plan both go into the end-of-plan sale', () => {
    // Two holdings: $6,000 in the plan's ETF (paid $5,000 in 2020), $4,000 kept in BBB at 0% (paid $5,000 in 2020).
    // 1 Jul 2025 – 30 Jun 2026: the ETF grows 10% to $6,600, gain $1,600 → $800 taxable; BBB has a $1,000 loss.
    // Net capital gain: losses come off before the discount: ($1,600 − $1,000) × 50% = $300 → tax $90.
    const p = plan({
      startDate: '2025-07-01',
      startingBalance: 1_000_000,
      phases: [rate30()],
      realism: flatTax(),
      startingMoney: {
        entry: 'holdings',
        holdings: [
          holding({ value: 600_000, costBase: 500_000, boughtOn: '2020-03-01' }),
          holding({ value: 400_000, costBase: 500_000, boughtOn: '2020-03-01', investment: { kind: 'etf', etf: 'BBB' }, returnRate: 0, distribution: { yield: 0, frankedPct: 0, foreignPct: 0, foreignTaxPct: 15, frequency: 'yearly' } }),
        ],
      },
    })
    const r = runManual(p)
    expect(r.endSale!.marketValue).toBeCloseTo(1_060_000, 4)
    expect(r.tax.netCapitalGains).toBeCloseTo(30_000, 4)
    expect(r.tax.total).toBeCloseTo(9_000, 4)
    // "Don't sell" works out the same tax without selling.
    const hold = runManual({ ...p, realism: flatTax({ atEnd: 'hold' }) })
    expect(hold.endSale!.tax).toBeCloseTo(9_000, 4)
    expect(hold.finalBalance).toBeCloseTo(1_060_000, 4)
  })
})

describe('"Move them into my plan\'s investments"', () => {
  // A one-day plan on 1 Jan 2026, 0% growth, no fund fee. $10,000 of ETF BBB, paid $6,000 in 2020, moved into the
  // first phase's ETF AAA. Brokerage $10 a trade; tax at a flat 30%.
  //   sale: $10,000 − $10 brokerage = $9,990; gain $9,990 − $6,000 = $3,990, held over 12 months → $1,995 taxable
  //   tax: 30% × $1,995 = $598.50, paid from the sale → $9,391.50 to reinvest
  //   buy: $9,391.50 − $10 brokerage = $9,381.50 invested (its cost base is $9,391.50)
  const p = plan({
    phases: [rate30({ duration: { count: 1, unit: 'days' }, returnRate: { kind: 'fixed', value: 0 } })],
    realism: {
      ...flatTax({ atEnd: 'hold' }),
      fees: true,
      feeSettings: { brokerage: { kind: 'flat', fee: 1_000 }, buyFrequency: 'eachDeposit', cashRate: 0, fxFeePct: 0, platformFee: 0, platformFeePer: 'month', spreadPct: 0 },
    },
    startingMoney: {
      entry: 'single',
      handling: 'move',
      single: { investment: { kind: 'etf', etf: 'BBB' }, costBase: 600_000, boughtOn: '2020-01-01', returnRate: 0, distribution: { yield: 0, frankedPct: 0, foreignPct: 0, foreignTaxPct: 15, frequency: 'yearly' } },
    },
  })

  it('charges capital gains tax and brokerage on day one', () => {
    const r = runManual(p)
    expect(r.fees.brokerage).toBeCloseTo(2_000, 6)
    expect(r.years[0].tax).toBeCloseTo(59_850, 6)
    expect(r.finalBalance).toBeCloseTo(938_150, 6)
    expect(r.startingBalance).toBe(1_000_000)
    // "Don't sell": the new lot cost $9,391.50 and would sell for $9,371.50 after brokerage, a $20 loss. That comes off
    // the same year's $3,990 gain before the discount: ($3,970 × 50%) × 30% = $595.50, so the sale would save $3.00.
    expect(r.endSale!.tax).toBeCloseTo(-300, 6)
  })

  it('with only one switch on, only that cost', () => {
    expect(runManual(p, { fees: true, tax: false, inflation: false }).finalBalance).toBeCloseTo(998_000, 6) // two $10 trades
    expect(runManual(p, { fees: false, tax: true, inflation: false }).finalBalance).toBeCloseTo(940_000, 6) // 30% × $2,000
    // Everything off: moving costs nothing, the same as "Same as the first phase".
    expect(runManual(p, { fees: false, tax: false, inflation: false }).finalBalance).toBeCloseTo(1_000_000, 6)
  })

  it('keeping it instead costs nothing on day one', () => {
    const keep = runManual({ ...p, startingMoney: { ...p.startingMoney!, handling: 'keep' } })
    expect(keep.fees.brokerage).toBe(0)
    expect(keep.years[0].tax).toBe(0)
    // It does pay its own fund fee (the default 0.2% a year) for its one day: $10,000 × 0.2% ÷ 12 ÷ 31 = 5.4c.
    expect(keep.fees.mer).toBeCloseTo((1_000_000 * 0.2) / 100 / 12 / 31, 6)
    expect(keep.finalBalance).toBeCloseTo(1_000_000 - keep.fees.mer, 6)
  })
})

describe('withdrawals take from every investment in proportion to its value (pro-rata)', () => {
  // 1 Jan 2026: $6,000 in the plan's ETF (10% a year) and $4,000 kept in a savings account at 0%. $1,000 is taken out
  // on the first day: $600 from the ETF and $400 from savings. After a year: $5,400 × 1.1 + $3,600 = $9,540.
  const p = plan({
    startingBalance: 1_000_000,
    phases: [phase()],
    events: [{ id: 'w', name: 'Holiday', date: '2026-01-01', amount: -100_000 }],
    startingMoney: { entry: 'holdings', holdings: [holding({ value: 600_000 }), holding({ value: 400_000, investment: { kind: 'cash', rate: 0 } })] },
  })

  it('splits by value', () => {
    const r = runManual(p)
    expect(r.finalBalance).toBeCloseTo(954_000, 4)
    expect(r.totalWithdrawn).toBe(100_000)
    expect(startingTotal(p)).toBe(1_000_000)
  })

  it('each sale pays its own trading costs (none for a savings account)', () => {
    // Fees on, $10 brokerage: the ETF sells $610 to hand over $600; savings hands over $400 for nothing.
    // $5,390 × 1.1 + $3,600 = $9,529.
    const r = runManual({
      ...p,
      realism: { fees: true, tax: false, inflation: false, feeSettings: { brokerage: { kind: 'flat', fee: 1_000 }, buyFrequency: 'eachDeposit', cashRate: 0, fxFeePct: 0, platformFee: 0, platformFeePer: 'month', spreadPct: 0 } },
    })
    expect(r.fees.brokerage).toBeCloseTo(1_000, 6)
    expect(r.finalBalance).toBeCloseTo(952_900, 4)
  })

  it('a withdrawal bigger than everything empties every investment', () => {
    const r = runManual({ ...p, events: [{ id: 'w', name: 'Everything', date: '2026-01-01', amount: -2_000_000 }] })
    expect(r.finalBalance).toBe(0)
    expect(r.totalWithdrawn).toBeCloseTo(1_000_000, 6)
    expect(r.warnings.some((w) => w.includes('wanted $20000.00 but only $10000.00'))).toBe(true)
  })
})

describe('Prediction mode with holdings', () => {
  const monthly = (pct: number) => Math.pow(1 + pct / 100, 1 / 12) - 1
  function flatHistory(months: number): HistoryTable {
    const col = (pct: number) => new Float64Array(months).fill(monthly(pct))
    return { months: Array.from({ length: months }, (_, i) => `m${i}`), assets: { [etfKey('AAA')]: col(7), [etfKey('BBB')]: col(5), [CASH_KEY]: col(4) }, inflation: col(2.5) }
  }
  const p = plan({
    startDate: '2026-03-15',
    startingBalance: 2_500_000,
    realism: everything,
    goal: { amount: 6_000_000, date: '2036-01-01' },
    events: [{ id: 'car', name: 'Car', date: '2031-02-10', amount: -1_000_000 }],
    phases: [
      phase({ duration: { count: 6, unit: 'years' }, depositFrequency: 'monthly', deposit: { kind: 'fixed', value: 50_000 }, returnRate: { kind: 'fixed', value: 7 }, mer: 0.2, otherIncome: 6_000_000, distribution: { yield: 3, frankedPct: 70, foreignPct: 0, foreignTaxPct: 15, frequency: 'quarterly' } }),
      phase({ duration: { count: 4, unit: 'years' }, returnRate: { kind: 'fixed', value: 7 }, otherIncome: 9_000_000 }),
    ],
    startingMoney: {
      entry: 'holdings',
      holdings: [
        holding({ value: 1_000_000, costBase: 700_000, boughtOn: '2022-05-01' }),
        holding({ value: 800_000, costBase: 900_000, boughtOn: '2025-11-20', investment: { kind: 'etf', etf: 'BBB' }, returnRate: 5, mer: 0.3, usListed: true, distribution: { yield: 1.5, frankedPct: 0, foreignPct: 100, foreignTaxPct: 15, frequency: 'halfYearly' } }),
        holding({ value: 700_000, boughtOn: '2024-01-01', investment: { kind: 'cash', rate: 4 } }),
      ],
    },
  })

  it('a constant history gives exactly the Manual answer, with every switch on and off', () => {
    const history = flatHistory(240)
    for (const sw of [ALL_SWITCHES[0], ALL_SWITCHES[7], ALL_SWITCHES[3]]) {
      const q = { ...p, realism: { ...everything, ...sw } }
      const manual = runManual(q)
      const d = runPrediction(preparePrediction(q, history, { runs: 8, blockMonths: 12, seed: 1, percentiles: [10, 50, 90] })).median.detail
      expect(d.finalBalance).toBeCloseTo(manual.finalBalance, 2)
      expect(d.finalReal).toBeCloseTo(manual.finalReal, 2)
      expect(d.tax.total).toBeCloseTo(manual.tax.total, 2)
      expect(d.fees.total).toBeCloseTo(manual.fees.total, 2)
      expect(d.totalWithdrawn).toBeCloseTo(manual.totalWithdrawn, 2)
    }
  })

  it('every holding reads the same sampled month as the phases and inflation', () => {
    const n = 300
    const a = Float64Array.from({ length: n }, (_, i) => 0.01 * Math.sin(i))
    const b = Float64Array.from({ length: n }, (_, i) => 0.02 * Math.cos(i * 1.3))
    const cash = Float64Array.from({ length: n }, (_, i) => 0.003 + 0.001 * Math.sin(i / 7))
    const infl = Float64Array.from({ length: n }, (_, i) => 0.002 + 0.001 * Math.cos(i / 5))
    const history: HistoryTable = { months: Array.from({ length: n }, (_, i) => `m${i}`), assets: { [etfKey('AAA')]: a, [etfKey('BBB')]: b, [CASH_KEY]: cash }, inflation: infl }
    const prep = preparePrediction(p, history, { runs: 3, blockMonths: 12, seed: 5, percentiles: [10, 50, 90] })
    const c = prep.compiled
    expect(c.kept.map((h) => h.investment?.kind)).toEqual(['cash', 'etf']) // oldest purchase first
    for (const run of [0, 1, 2]) {
      const sample = sampledMonths(prep, run)
      const path = buildPath(prep, run)
      for (let k = 0; k < prep.months; k++) {
        expect(path.monthly[0][k] === a[sample[k]] || k > prep.phaseMonths[0].last).toBe(true)
        expect(path.sleeveMonthly![0][k]).toBe(cash[sample[k]])
        expect(path.sleeveMonthly![1][k]).toBe(b[sample[k]])
      }
      // The savings holding's whole return is interest; the ETF holding uses its own yield.
      for (let t = 0; t < c.n; t += 37) {
        expect(path.sleeves![0].income![t]).toBe(path.sleeves![0].growth[t])
        expect(path.sleeves![1].income).toBeUndefined()
        const k = prep.monthOf[t]
        expect(path.sleeves![1].growth[t]).toBeCloseTo(Math.pow(1 + b[sample[k]], 1 / prep.monthDays[k]), 15)
        expect(path.inflation[t]).toBeCloseTo(Math.pow(1 + infl[sample[k]], 1 / prep.monthDays[k]), 15)
      }
    }
    // The biggest drop is measured across all the investments together.
    const r = runPrediction(prep)
    expect(r.median.detail.portfolioIndex).toBeDefined()
    expect(r.median.detail.portfolioIndex!.length).toBe(prep.months + 1)
  })

  it('"move" needs no history for the holdings it sells', () => {
    const moved = { ...p, startingMoney: { ...p.startingMoney!, handling: 'move' as const } }
    expect(keptHoldings(moved)).toHaveLength(0)
    expect(etfsUsed(moved)).toEqual(['AAA'])
    const history: HistoryTable = { months: ['a', 'b'].concat(Array.from({ length: 40 }, (_, i) => `m${i}`)), assets: { [etfKey('AAA')]: new Float64Array(42).fill(0.005) }, inflation: new Float64Array(42).fill(0.002) }
    expect(() => runPrediction(preparePrediction(moved, history, { runs: 5, blockMonths: 12, seed: 1, percentiles: [10, 50, 90] }))).not.toThrow()
  })

  it('stays quick: 2,000 runs of a 40-year plan with 3 holdings kept separately', () => {
    const long = plan({
      realism: everything,
      phases: [phase({ duration: { count: 40, unit: 'years' }, depositFrequency: 'weekly', deposit: { kind: 'fixed', value: 10_000 }, mer: 0.2, distribution: { yield: 3, frankedPct: 50, foreignPct: 0, foreignTaxPct: 15, frequency: 'quarterly' } })],
      startingMoney: {
        entry: 'holdings',
        holdings: [
          holding({ value: 500_000, costBase: 400_000, boughtOn: '2021-01-01', investment: { kind: 'etf', etf: 'BBB' } }),
          holding({ value: 300_000, boughtOn: '2024-06-01', investment: { kind: 'cash', rate: 4 } }),
          holding({ value: 200_000, costBase: 250_000, boughtOn: '2023-02-01', investment: { kind: 'mix', parts: [{ etf: 'AAA', weight: 60 }, { etf: 'BBB', weight: 40 }] } }),
        ],
      },
    })
    const n = 600
    const history: HistoryTable = {
      months: Array.from({ length: n }, (_, i) => `m${i}`),
      assets: {
        [etfKey('AAA')]: Float64Array.from({ length: n }, (_, i) => 0.007 + 0.04 * Math.sin(i * 1.7)),
        [etfKey('BBB')]: Float64Array.from({ length: n }, (_, i) => 0.005 + 0.03 * Math.cos(i * 0.9)),
        [CASH_KEY]: new Float64Array(n).fill(0.003),
      },
      inflation: new Float64Array(n).fill(0.002),
    }
    const started = performance.now()
    const r = runPrediction(preparePrediction(long, history, { runs: 2000, blockMonths: 12, seed: 1, percentiles: [10, 50, 90] }))
    const seconds = (performance.now() - started) / 1000
    console.info(`2,000 runs of a 40-year plan with 3 holdings kept separately, every switch on: ${seconds.toFixed(2)} s`)
    expect(r.runs).toBe(2000)
    expect(seconds).toBeLessThan(30)
  }, 60_000)
})

describe('checking the new details', () => {
  it('explains each problem clearly', () => {
    const msgs = (startingMoney: unknown) => startingMoneyProblems(plan({ startingMoney: startingMoney as StartingMoney })).map((p) => p.message)
    expect(msgs({ entry: 'single' })).toEqual([])
    expect(msgs({ entry: 'what' })[0]).toMatch(/One amount/)
    expect(msgs({ entry: 'single', handling: 'sideways' })[0]).toMatch(/Keep them as they are/)
    expect(msgs({ entry: 'single', single: { costBase: -1 } })[0]).toMatch(/what you paid can’t be negative/)
    expect(msgs({ entry: 'single', single: { boughtOn: '2026-02-01' } })[0]).toMatch(/can’t be after the plan starts/)
    expect(msgs({ entry: 'single', single: { boughtOn: 'soon' } })[0]).toMatch(/when you bought it/)
    expect(msgs({ entry: 'single', single: { boughtOn: '1850-01-01' } })[0]).toMatch(/1900/)
    expect(msgs({ entry: 'single', single: { returnRate: -100 } })[0]).toMatch(/expected return/)
    expect(msgs({ entry: 'single', single: { mer: 12 } })[0]).toMatch(/management fee/)
    expect(msgs({ entry: 'single', single: { investment: { kind: 'mix', parts: [] } } })[0]).toMatch(/at least one ETF/)
    expect(msgs({ entry: 'single', single: { distribution: { yield: 3, frankedPct: 120, foreignPct: 0, foreignTaxPct: 15, frequency: 'yearly' } } })[0]).toMatch(/distribution/)
    expect(msgs({ entry: 'holdings' })[0]).toMatch(/list of holdings/)
    expect(msgs({ entry: 'holdings', holdings: [{ id: 'x', name: 'Dad’s shares', value: -5 }] })[0]).toBe('Dad’s shares: today’s value can’t be negative.')
    expect(msgs({ entry: 'holdings', holdings: [{ id: 'x', value: 5, boughtOn: '2027-01-01' }] })[0]).toMatch(/^Holding 1: /)
    // They stop the plan being worked out.
    expect(validatePlan(plan({ startingMoney: { entry: 'single', single: { costBase: -1 } } })).some((p) => p.where === 'money')).toBe(true)
  })

  it('a holding bought on the start date is fine; an empty list means $0', () => {
    expect(startingMoneyProblems(plan({ startingMoney: { entry: 'single', single: { boughtOn: '2026-01-01' } } }))).toEqual([])
    const empty = plan({ startingBalance: 0, startingMoney: { entry: 'holdings', holdings: [] } })
    expect(runManual(empty).finalBalance).toBe(0)
    expect(compilePlan(empty).holdings).toHaveLength(0)
  })
})

import { describe, expect, it } from 'vitest'
import { dayToISO, toDayNumber } from './dates'
import { financialYearLabel, runManual } from './manual'
import { paymentDays } from './schedule'
import type { Phase, Plan } from './types'
import { validatePlan } from './validate'

let nextId = 0
function phase(p: Partial<Phase> = {}): Phase {
  return {
    id: `p${nextId++}`,
    name: 'Phase',
    duration: { count: 1, unit: 'years' },
    depositFrequency: 'none',
    deposit: { kind: 'fixed', value: 0 },
    returnRate: { kind: 'fixed', value: 0 },
    ...p,
  }
}

function plan(p: Partial<Plan> = {}): Plan {
  return {
    id: 'plan',
    name: 'Test',
    startDate: '2026-01-01',
    startingBalance: 0,
    currency: 'AUD',
    phases: [phase()],
    events: [],
    ...p,
  }
}

// Every result must add up: what you have = what you put in (net) + growth.
function expectAddsUp(r: ReturnType<typeof runManual>) {
  expect(r.finalBalance).toBeCloseTo(r.netContributed + r.totalGrowth, 4)
  for (const y of r.years) {
    expect(y.closing).toBeCloseTo(y.opening + y.deposits - y.withdrawals + y.growth, 4)
  }
  for (let i = 1; i < r.years.length; i++) expect(r.years[i].opening).toBeCloseTo(r.years[i - 1].closing, 6)
}

describe('compound growth matches the standard formulas', () => {
  it('lump sum: $10,000 at 7% for 10 years = $19,671.51', () => {
    const r = runManual(plan({ startingBalance: 1_000_000, phases: [phase({ duration: { count: 10, unit: 'years' }, returnRate: { kind: 'fixed', value: 7 } })] }))
    // 10000 × 1.07^10 = 19,671.5136
    expect(r.finalBalance).toBeCloseTo(1_967_151.3573, 2)
    expect(Math.round(r.finalBalance)).toBe(1_967_151)
    expectAddsUp(r)
  })

  it('12 months at 7% is exactly 7%, even starting mid-month', () => {
    const r = runManual(plan({ startDate: '2026-03-15', startingBalance: 100_000, phases: [phase({ returnRate: { kind: 'fixed', value: 7 } })] }))
    expect(r.finalBalance).toBeCloseTo(107_000, 6)
  })

  it('12 months at 7% across a leap-year February is still exactly 7%', () => {
    const r = runManual(plan({ startDate: '2027-09-01', startingBalance: 100_000, phases: [phase({ returnRate: { kind: 'fixed', value: 7 } })] }))
    expect(r.finalBalance).toBeCloseTo(107_000, 6)
  })

  it('$500 a month for 10 years at 6% matches the "deposit at start of month" formula ($81,632.15)', () => {
    const r = runManual(
      plan({
        phases: [
          phase({
            duration: { count: 10, unit: 'years' },
            depositFrequency: 'monthly',
            deposit: { kind: 'fixed', value: 50_000 },
            returnRate: { kind: 'fixed', value: 6 },
          }),
        ],
      }),
    )
    // i = 1.06^(1/12) − 1;  FV = 500 × ((1+i)^120 − 1) / i × (1+i)
    expect(r.finalBalance).toBeCloseTo(8_163_214.5062, 2)
    expect(r.totalDeposited).toBe(6_000_000)
    expectAddsUp(r)
  })

  it('$1,000 a year for 5 years at 5% = $5,801.91', () => {
    const r = runManual(
      plan({
        phases: [
          phase({
            duration: { count: 5, unit: 'years' },
            depositFrequency: 'yearly',
            deposit: { kind: 'fixed', value: 100_000 },
            returnRate: { kind: 'fixed', value: 5 },
          }),
        ],
      }),
    )
    expect(r.finalBalance).toBeCloseTo(580_191.28125, 2)
  })

  it('a negative return shrinks the balance by exactly that much over a year', () => {
    const r = runManual(plan({ startingBalance: 100_000, phases: [phase({ returnRate: { kind: 'fixed', value: -20 } })] }))
    expect(r.finalBalance).toBeCloseTo(80_000, 6)
  })
})

describe('deposit timing', () => {
  it('weekly for one calendar year is 53 deposits (365 days = 52 weeks + 1 day)', () => {
    const r = runManual(plan({ phases: [phase({ depositFrequency: 'weekly', deposit: { kind: 'fixed', value: 5_000 } })] }))
    expect(r.phases[0].depositCount).toBe(53)
    expect(r.finalBalance).toBe(265_000)
  })

  it('fortnightly for one year is 27 deposits, monthly 12, quarterly 4, yearly 1', () => {
    const s = toDayNumber('2026-01-01')
    const e = toDayNumber('2027-01-01')
    expect(paymentDays(s, e, 'fortnightly')).toHaveLength(27)
    expect(paymentDays(s, e, 'monthly')).toHaveLength(12)
    expect(paymentDays(s, e, 'quarterly')).toHaveLength(4)
    expect(paymentDays(s, e, 'yearly')).toHaveLength(1)
    expect(paymentDays(s, e, 'daily')).toHaveLength(365)
    expect(paymentDays(s, e, 'none')).toHaveLength(0)
  })

  it('monthly deposits from the 31st land on the last day of shorter months', () => {
    const days = paymentDays(toDayNumber('2026-01-31'), toDayNumber('2026-06-01'), 'monthly').map(dayToISO)
    expect(days).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31'])
  })

  it('yearly deposits from 29 Feb use 28 Feb in normal years', () => {
    const days = paymentDays(toDayNumber('2028-02-29'), toDayNumber('2033-01-01'), 'yearly').map(dayToISO)
    expect(days).toEqual(['2028-02-29', '2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29'])
  })

  it('a one-day phase with daily deposits gets exactly one deposit', () => {
    const r = runManual(plan({ phases: [phase({ duration: { count: 1, unit: 'days' }, depositFrequency: 'daily', deposit: { kind: 'fixed', value: 1_000 } })] }))
    expect(r.phases[0].depositCount).toBe(1)
    expect(r.finalBalance).toBe(1_000)
    expect(r.endDay - r.startDay).toBe(1)
  })

  it('phases run back to back', () => {
    const r = runManual(
      plan({
        phases: [
          phase({ duration: { count: 6, unit: 'months' }, depositFrequency: 'monthly', deposit: { kind: 'fixed', value: 10_000 } }),
          phase({ duration: { count: 2, unit: 'fortnights' }, depositFrequency: 'weekly', deposit: { kind: 'fixed', value: 1_000 } }),
          phase({ duration: { count: 1, unit: 'decades' } }),
        ],
      }),
    )
    expect(dayToISO(r.phases[1].start)).toBe('2026-07-01')
    expect(dayToISO(r.phases[2].start)).toBe('2026-07-29')
    expect(dayToISO(r.endDay)).toBe('2036-07-29')
    expect(r.finalBalance).toBe(60_000 + 4_000)
  })
})

describe('phase dates don’t drift from month-end clamping', () => {
  it('from 31 Jan: 1 month then 11 months at 7% ends on 31 Jan 2027 with exactly $10,700', () => {
    const r = runManual(
      plan({
        startDate: '2026-01-31',
        startingBalance: 1_000_000,
        phases: [phase({ duration: { count: 1, unit: 'months' }, returnRate: { kind: 'fixed', value: 7 } }), phase({ duration: { count: 11, unit: 'months' }, returnRate: { kind: 'fixed', value: 7 } })],
      }),
    )
    expect(dayToISO(r.phases[1].start)).toBe('2026-02-28')
    expect(dayToISO(r.endDay)).toBe('2027-01-31') // was 28 Jan 2027 ($10,694.16)
    expect(r.finalBalance).toBeCloseTo(1_070_000, 4)
  })

  it('from 31 Mar: month phases end on 30 Apr, then 31 May (not 30 May)', () => {
    const r = runManual(plan({ startDate: '2026-03-31', phases: [phase({ duration: { count: 1, unit: 'months' } }), phase({ duration: { count: 1, unit: 'months' } })] }))
    expect(dayToISO(r.phases[1].start)).toBe('2026-04-30')
    expect(dayToISO(r.endDay)).toBe('2026-05-31')
  })

  it('a phase measured in days restarts the count from its own end', () => {
    // 31 Jan + 1 month = 28 Feb; + 3 days = 3 Mar; + 1 month = 3 Apr.
    const r = runManual(
      plan({ startDate: '2026-01-31', phases: [phase({ duration: { count: 1, unit: 'months' } }), phase({ duration: { count: 3, unit: 'days' } }), phase({ duration: { count: 1, unit: 'months' } })] }),
    )
    expect(dayToISO(r.phases[2].start)).toBe('2026-03-03')
    expect(dayToISO(r.endDay)).toBe('2026-04-03')
  })

  it('years from 29 Feb: 28 Feb in normal years, back to 29 Feb in a leap year', () => {
    const r = runManual(plan({ startDate: '2024-02-29', phases: [phase(), phase(), phase(), phase()] }))
    expect(r.phases.map((p) => dayToISO(p.end))).toEqual(['2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29'])
  })
})

describe('step-ups', () => {
  it('a straight-line ramp from $100 to $200 starts and ends on the exact amounts', () => {
    const r = runManual(
      plan({
        phases: [phase({ depositFrequency: 'monthly', deposit: { kind: 'ramp', from: 10_000, to: 20_000, shape: 'linear' } })],
      }),
    )
    expect(r.phases[0].firstDeposit).toBe(10_000)
    expect(r.phases[0].lastDeposit).toBe(20_000)
    expect(r.totalDeposited).toBe(180_000) // average $150 × 12
  })

  it('slow-then-fast stays lower than straight-line in the middle, fast-then-slow higher', () => {
    const run = (shape: 'linear' | 'slowThenFast' | 'fastThenSlow') =>
      runManual(plan({ phases: [phase({ depositFrequency: 'monthly', deposit: { kind: 'ramp', from: 10_000, to: 20_000, shape } })] })).totalDeposited
    expect(run('slowThenFast')).toBeLessThan(run('linear'))
    expect(run('fastThenSlow')).toBeGreaterThan(run('linear'))
  })

  it('custom steps: $100/month, +$20 every 6 months, for 2 years = $3,120', () => {
    const r = runManual(
      plan({
        phases: [
          phase({
            duration: { count: 2, unit: 'years' },
            depositFrequency: 'monthly',
            deposit: { kind: 'steps', from: 10_000, stepBy: 2_000, every: { count: 6, unit: 'months' } },
          }),
        ],
      }),
    )
    // 6 × $100 + 6 × $120 + 6 × $140 + 6 × $160
    expect(r.totalDeposited).toBe(312_000)
    expect(r.phases[0].lastDeposit).toBe(16_000)
  })

  it('a ramp over part of the phase holds the start amount before and the end amount after', () => {
    const r = runManual(
      plan({
        phases: [
          phase({
            duration: { count: 3, unit: 'years' },
            depositFrequency: 'yearly',
            deposit: { kind: 'ramp', from: 100_000, to: 300_000, shape: 'linear', startAfter: { count: 1, unit: 'years' }, lasts: { count: 1, unit: 'years' } },
          }),
        ],
      }),
    )
    // Year 1: before the window ($1,000). Year 2: only deposit in the window, so it is the end amount ($3,000). Year 3: after ($3,000).
    expect(r.totalDeposited).toBe(700_000)
  })

  it('a return rate ramp from 0% to 10% gives growth between the two', () => {
    const at = (rate: number) =>
      runManual(plan({ startingBalance: 100_000, phases: [phase({ duration: { count: 5, unit: 'years' }, returnRate: { kind: 'fixed', value: rate } })] })).finalBalance
    const ramp = runManual(
      plan({ startingBalance: 100_000, phases: [phase({ duration: { count: 5, unit: 'years' }, returnRate: { kind: 'ramp', from: 0, to: 10, shape: 'linear' } })] }),
    ).finalBalance
    expect(ramp).toBeGreaterThan(at(0))
    expect(ramp).toBeLessThan(at(10))
    expect(ramp).toBeCloseTo(at(5), -3) // roughly like a 5% average
  })
})

describe('one-off events and edge cases', () => {
  it('nothing in, no return: the balance doesn’t move', () => {
    const r = runManual(plan({ startingBalance: 12_345, phases: [phase({ duration: { count: 3, unit: 'decades' } })] }))
    expect(r.finalBalance).toBe(12_345)
    expect(r.totalGrowth).toBe(0)
  })

  it('zero balance with a positive return stays at zero', () => {
    const r = runManual(plan({ phases: [phase({ returnRate: { kind: 'fixed', value: 8 } })] }))
    expect(r.finalBalance).toBe(0)
  })

  it('adds money-in events and takes out withdrawals', () => {
    const r = runManual(
      plan({
        startingBalance: 100_000,
        events: [
          { id: 'e1', name: 'Birthday', date: '2026-03-01', amount: 20_000 },
          { id: 'e2', name: 'Phone', date: '2026-06-01', amount: -50_000 },
        ],
      }),
    )
    expect(r.finalBalance).toBe(70_000)
    expect(r.totalWithdrawn).toBe(50_000)
    expect(r.netContributed).toBe(70_000)
  })

  it('a withdrawal bigger than the balance empties it, never goes negative, and warns', () => {
    const r = runManual(
      plan({
        startingBalance: 100_000,
        phases: [phase({ returnRate: { kind: 'fixed', value: 5 } })],
        events: [{ id: 'e', name: 'Car', date: '2026-06-01', amount: -1_500_000 }],
      }),
    )
    expect(r.finalBalance).toBe(0)
    expect(r.totalWithdrawn).toBeGreaterThan(100_000)
    expect(r.totalWithdrawn).toBeLessThan(110_000)
    expect(r.warnings.join(' ')).toMatch(/Car/)
    expectAddsUp(r)
  })

  it('events outside the plan are left out with a warning', () => {
    const r = runManual(plan({ events: [{ id: 'e', name: 'Too late', date: '2040-01-01', amount: 100 }] }))
    expect(r.finalBalance).toBe(0)
    expect(r.warnings.join(' ')).toMatch(/Too late/)
  })
})

describe('Australian financial years', () => {
  it('splits a calendar-year plan into two financial years that add up', () => {
    const r = runManual(
      plan({
        startingBalance: 500_000,
        phases: [phase({ depositFrequency: 'monthly', deposit: { kind: 'fixed', value: 10_000 }, returnRate: { kind: 'fixed', value: 7 } })],
      }),
    )
    expect(r.years.map((y) => financialYearLabel(y.fy))).toEqual(['2025–26', '2026–27'])
    expect(dayToISO(r.years[0].lastDay)).toBe('2026-06-30')
    expect(dayToISO(r.years[1].firstDay)).toBe('2026-07-01')
    expect(r.years[0].deposits).toBe(60_000)
    expect(r.years[1].deposits).toBe(60_000)
    expect(r.years[1].closing).toBeCloseTo(r.finalBalance, 6)
    expectAddsUp(r)
  })
})

describe('goal', () => {
  it('reports whether the goal is reached by its date and when it was first reached', () => {
    const r = runManual(
      plan({
        phases: [phase({ duration: { count: 2, unit: 'years' }, depositFrequency: 'monthly', deposit: { kind: 'fixed', value: 10_000 } })],
        goal: { amount: 100_000, date: '2026-12-31' },
      }),
    )
    expect(r.goal?.reached).toBe(true)
    expect(dayToISO(r.goal!.firstReachedDay!)).toBe('2026-10-01') // 10th deposit
    expect(r.goal?.outsidePlan).toBe(false)
  })
})

describe('chart data', () => {
  it('starts with the starting balance and ends with the final balance', () => {
    const r = runManual(plan({ startingBalance: 5_000, phases: [phase({ duration: { count: 40, unit: 'years' }, returnRate: { kind: 'fixed', value: 6 } })] }))
    expect(r.series[0].balance).toBe(5_000)
    expect(r.series[r.series.length - 1].day).toBe(r.endDay)
    expect(r.series[r.series.length - 1].balance).toBe(r.finalBalance)
    expect(r.series.length).toBeLessThan(800)
  })
})

describe('checking plans', () => {
  it('catches impossible inputs', () => {
    expect(validatePlan(plan({ phases: [] }))).not.toHaveLength(0)
    expect(validatePlan(plan({ phases: [phase({ duration: { count: 0, unit: 'years' } })] }))).not.toHaveLength(0)
    expect(validatePlan(plan({ phases: [phase({ deposit: { kind: 'fixed', value: -5 } })] }))).not.toHaveLength(0)
    expect(validatePlan(plan({ phases: [phase({ returnRate: { kind: 'fixed', value: -100 } })] }))).not.toHaveLength(0)
    expect(validatePlan(plan({ phases: [phase({ duration: { count: 11, unit: 'decades' } })] }))).not.toHaveLength(0)
    expect(validatePlan(plan({ startDate: '2026-02-30' }))).not.toHaveLength(0)
    expect(validatePlan(plan())).toHaveLength(0)
  })

  it('a 100-year plan with daily deposits runs quickly', () => {
    const t = performance.now()
    runManual(plan({ phases: [phase({ duration: { count: 10, unit: 'decades' }, depositFrequency: 'daily', deposit: { kind: 'fixed', value: 100 }, returnRate: { kind: 'fixed', value: 7 } })] }))
    expect(performance.now() - t).toBeLessThan(1000)
  })
})

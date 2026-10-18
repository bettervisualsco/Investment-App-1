import { describe, expect, it } from 'vitest'
import { CASH_KEY, customParams, customReturns, etfKey, mixReturns } from './assets'
import { maxDrawdown } from './bootstrap'
import { compilePlan } from './compile'
import { runCostComparison, runManual } from './manual'
import { buildPath, drawdownOf, preparePrediction, runPrediction, runPredictionCost, type HistoryTable, type PredictionOptions } from './prediction'
import type { CustomAsset, Phase, Plan, Realism } from './types'
import { investmentProblem, predictionProblems, validatePlan } from './validate'

let nextId = 0
function phase(p: Partial<Phase> = {}): Phase {
  return {
    id: `p${nextId++}`,
    name: 'Phase',
    duration: { count: 5, unit: 'years' },
    depositFrequency: 'monthly',
    deposit: { kind: 'fixed', value: 50_000 },
    returnRate: { kind: 'fixed', value: 7 },
    investment: { kind: 'etf', etf: 'AAA' },
    ...p,
  }
}

function plan(p: Partial<Plan> = {}): Plan {
  return { id: 'plan', name: 'Test', startDate: '2026-03-15', startingBalance: 1_000_000, currency: 'AUD', phases: [phase()], events: [], ...p }
}

const opts = (o: Partial<PredictionOptions> = {}): PredictionOptions => ({ runs: 200, blockMonths: 12, seed: 7, percentiles: [10, 50, 90], ...o })

/** A history where every month has the same returns (yearly % → the monthly rate that compounds to it). */
function flatHistory(months: number, yearly: Record<string, number>, inflationYearly: number): HistoryTable {
  const monthly = (pct: number) => Math.pow(1 + pct / 100, 1 / 12) - 1
  const assets: Record<string, Float64Array> = {}
  for (const [k, pct] of Object.entries(yearly)) assets[k] = new Float64Array(months).fill(monthly(pct))
  return { months: Array.from({ length: months }, (_, i) => `2000-${i}`), assets, inflation: new Float64Array(months).fill(monthly(inflationYearly)) }
}

/** A made-up but bumpy history: 30 years of months with crashes, booms and inflation swings. */
function bumpyHistory(): HistoryTable {
  const n = 360
  const a = new Float64Array(n)
  const b = new Float64Array(n)
  const cash = new Float64Array(n)
  const infl = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    a[i] = 0.007 + 0.045 * Math.sin(i * 1.7) + (i % 97 === 5 ? -0.25 : 0)
    b[i] = 0.004 + 0.02 * Math.cos(i * 0.9)
    cash[i] = 0.003 + 0.002 * Math.sin(i / 40)
    infl[i] = 0.002 + 0.003 * Math.sin(i / 25)
  }
  return { months: Array.from({ length: n }, (_, i) => `m${i}`), assets: { [etfKey('AAA')]: a, [etfKey('BBB')]: b, [CASH_KEY]: cash }, inflation: infl }
}

const everything: Realism = {
  fees: true,
  tax: true,
  inflation: true,
  feeSettings: { brokerage: { kind: 'flat', fee: 500 }, buyFrequency: 'monthly', cashRate: 1, fxFeePct: 0.5, platformFee: 200, platformFeePer: 'month', spreadPct: 0.1 },
  taxSettings: { basis: 'income', medicare: true, brackets: 'indexed', distributions: 'reinvest', atEnd: 'sell', owner: 'adult', minorMoney: 'family', cgtRules: 'law', cgtMinimum: true },
  inflationSettings: { rate: { kind: 'fixed', value: 2.5 } },
}

describe('a history of constant returns gives exactly the Manual-mode answer', () => {
  const p = plan({
    realism: everything,
    goal: { amount: 8_000_000, date: '2040-01-01' },
    events: [
      { id: 'e1', name: 'Gift', date: '2028-07-01', amount: 300_000 },
      { id: 'e2', name: 'Car', date: '2033-02-10', amount: -1_500_000 },
    ],
    phases: [
      phase({ mer: 0.2, otherIncome: 6_000_000, distribution: { yield: 3, frankedPct: 70, foreignPct: 0, foreignTaxPct: 15, frequency: 'quarterly' }, growWithInflation: true }),
      phase({ investment: { kind: 'cash', rate: 4 }, duration: { count: 3, unit: 'years' }, otherIncome: 9_000_000 }),
      phase({ duration: { count: 7, unit: 'years' }, returnRate: { kind: 'fixed', value: 7 }, deposit: { kind: 'ramp', from: 50_000, to: 120_000, shape: 'linear' } }),
    ],
  })
  // Manual mode: ETF phases at 7%, the cash phase at its 4% savings rate, inflation 2.5%.
  const history = flatHistory(240, { [etfKey('AAA')]: 7, [CASH_KEY]: 4 }, 2.5)

  it('matches to the cent, with every switch on', () => {
    const manual = runManual(p)
    const prep = preparePrediction(p, history, opts({ runs: 20 }))
    const result = runPrediction(prep)
    const d = result.median.detail
    expect(d.finalBalance).toBeCloseTo(manual.finalBalance, 2)
    expect(d.finalReal).toBeCloseTo(manual.finalReal, 2)
    expect(d.tax.total).toBeCloseTo(manual.tax.total, 2)
    expect(d.fees.total).toBeCloseTo(manual.fees.total, 2)
    expect(d.totalDeposited).toBe(manual.totalDeposited)
    expect(d.years.length).toBe(manual.years.length)
    // Every simulation is the same, so every percentile line is the Manual line (in today's dollars).
    for (const line of Object.values(result.bands)) {
      manual.series.forEach((s, j) => expect(line[j]).toBeCloseTo(s.balance / s.cpi, 2))
    }
    expect(result.final.low).toBeCloseTo(manual.finalReal, 2)
    expect(result.final.high).toBeCloseTo(manual.finalReal, 2)
    expect(result.goal?.share).toBe(manual.goal!.reached ? 1 : 0)
  })

  it('matches with every switch off too, and for "Show the cost"', () => {
    const off = { ...p, realism: { ...everything, fees: false, tax: false, inflation: false } }
    const manual = runManual(off)
    const result = runPrediction(preparePrediction(off, history, opts({ runs: 10 })))
    expect(result.final.mid).toBeCloseTo(manual.finalBalance, 2)

    const cmp = runCostComparison(p)
    const prep = preparePrediction(p, history, opts({ runs: 10 }))
    const cost = runPredictionCost(prep, runPrediction(prep))
    expect(cost.allOff).toBeCloseTo(cmp.allOff.finalBalance, 2)
    cost.steps.forEach((s, i) => {
      expect(s.switch).toBe(cmp.steps[i].switch)
      expect(s.cost).toBeCloseTo(cmp.steps[i].cost, 2)
    })
  })
})

describe('replaying history', () => {
  const p = plan({
    realism: everything,
    goal: { amount: 5_000_000, date: '2041-01-01' },
    phases: [phase(), phase({ investment: { kind: 'mix', parts: [{ etf: 'AAA', weight: 70 }, { etf: 'BBB', weight: 30 }] } }), phase({ investment: { kind: 'cash', rate: 3 } })],
  })
  const history = bumpyHistory()

  it('gives the same answer every time with the same seed, and a different one with another seed', () => {
    const a = runPrediction(preparePrediction(p, history, opts()))
    const b = runPrediction(preparePrediction(p, history, opts()))
    const c = runPrediction(preparePrediction(p, history, opts({ seed: 8 })))
    expect(Array.from(a.finalsSorted)).toEqual(Array.from(b.finalsSorted))
    expect(a.final).toEqual(b.final)
    expect(a.median.run).toBe(b.median.run)
    expect(Array.from(c.finalsSorted)).not.toEqual(Array.from(a.finalsSorted))
  })

  it('keeps percentile lines in order, at every point and at the end', () => {
    const r = runPrediction(preparePrediction(p, history, opts({ percentiles: [5, 50, 95] })))
    const { low, innerLow, mid, innerHigh, high } = r.bands
    for (let j = 0; j < r.days.length; j++) {
      expect(low[j]).toBeLessThanOrEqual(innerLow[j])
      expect(innerLow[j]).toBeLessThanOrEqual(mid[j])
      expect(mid[j]).toBeLessThanOrEqual(innerHigh[j])
      expect(innerHigh[j]).toBeLessThanOrEqual(high[j])
    }
    expect(r.final.low).toBeLessThan(r.final.mid)
    expect(r.final.mid).toBeLessThan(r.final.high)
    expect(r.final.high).toBeCloseTo(high[high.length - 1], 6)
    // The middle simulation really is in the middle.
    expect(r.median.detail.finalReal).toBeCloseTo(r.finalsSorted[Math.floor((r.runs - 1) / 2)], 4)
  })

  it('counts goal and below-what-you-put-in simulations correctly', () => {
    const atEnd = { ...p, goal: { amount: 5_000_000, date: '2100-01-01' } } // past the end → checked on the last day
    const r = runPrediction(preparePrediction(atEnd, history, opts()))
    const expected = r.finalsSorted.filter((v) => v >= 5_000_000).length
    expect(r.goal?.outsidePlan).toBe(true)
    expect(r.goal?.count).toBe(expected)
    expect(r.goal?.share).toBeCloseTo(expected / r.runs, 10)

    const crash = flatHistory(60, { [etfKey('AAA')]: -20 }, 0)
    const single = plan({ phases: [phase()] })
    expect(runPrediction(preparePrediction(single, crash, opts({ runs: 50 }))).belowPutIn.share).toBe(1)
    // A withdrawal bigger than the balance in every simulation is counted once per simulation, grouped by kind.
    const car = { ...single, events: [{ id: 'car', name: 'Car', date: '2030-01-01', amount: -100_000_000 }] }
    const w = runPrediction(preparePrediction(car, crash, opts({ runs: 50 })))
    expect(w.runsWithWarnings).toBe(50)
    expect(w.runWarnings).toHaveLength(1)
    expect(w.runWarnings[0].count).toBe(50)
    expect(w.runWarnings[0].example).toMatch(/“Car” on 2030-01-01 wanted/)
    const boom = flatHistory(60, { [etfKey('AAA')]: 20 }, 0)
    expect(runPrediction(preparePrediction(single, boom, opts({ runs: 50 }))).belowPutIn.count).toBe(0)
  })

  it('reads every series from the same real month', () => {
    const n = 100
    const asset = Float64Array.from({ length: n }, (_, h) => h / 10_000)
    const infl = Float64Array.from({ length: n }, (_, h) => h / 100_000)
    const h: HistoryTable = { months: Array.from({ length: n }, (_, i) => `m${i}`), assets: { [etfKey('AAA')]: asset }, inflation: infl }
    const prep = preparePrediction(plan(), h, opts({ blockMonths: 7 }))
    for (const run of [0, 1, 2]) {
      const path = buildPath(prep, run)
      for (let t = 0; t < prep.compiled.n; t++) {
        const days = prep.monthDays[prep.monthOf[t]]
        const fromGrowth = Math.round((Math.pow(path.growth[t], days) - 1) * 10_000)
        const fromInflation = Math.round((Math.pow(path.inflation[t], days) - 1) * 100_000)
        expect(fromGrowth).toBe(fromInflation)
      }
    }
  })

  it('treats a cash phase’s whole return as interest (taxed as income)', () => {
    const prep = preparePrediction(p, history, opts())
    const path = buildPath(prep, 3)
    const c = prep.compiled
    for (let t = 0; t < c.n; t++) {
      if (c.phaseOf[t] === 2) expect(path.income![t]).toBe(path.growth[t])
      else expect(path.income![t]).toBe(0)
    }
  })

  it('finds the biggest drop of the middle simulation', () => {
    const long = plan({ phases: [phase({ duration: { count: 30, unit: 'years' } })] })
    const r = runPrediction(preparePrediction(long, history, opts()))
    expect(r.median.drawdown).not.toBeNull()
    expect(r.median.drawdown!.drop).toBeGreaterThan(0.25) // the history has −25% months
    expect(r.median.drawdown!.peakDay).toBeLessThan(r.median.drawdown!.troughDay)
    const series = [1, 1.2, 0.9, 1.3, 0.65, 0.7, 1.5]
    expect(drawdownOf(series)!.drop).toBeCloseTo(maxDrawdown(series), 12)
    expect(drawdownOf(series)).toEqual({ drop: 0.5, peak: 3, trough: 4 })
    expect(drawdownOf([1, 2, 3])).toBeNull()
  })

  it('runs 2,000 simulations of a 40-year plan with every switch on in a few seconds', () => {
    const long = plan({
      realism: everything,
      phases: [phase({ duration: { count: 40, unit: 'years' }, depositFrequency: 'weekly', deposit: { kind: 'fixed', value: 10_000 } })],
    })
    const started = performance.now()
    const r = runPrediction(preparePrediction(long, history, opts({ runs: 2000 })))
    const seconds = (performance.now() - started) / 1000
    console.info(`2,000 runs of a 40-year plan, every switch on: ${seconds.toFixed(2)} s`)
    expect(r.runs).toBe(2000)
    // About 2.3 s on Soham's Mac when it's idle; the limit is loose so a busy computer doesn't fail the test.
    expect(seconds).toBeLessThan(30)
  }, 60_000)
})

describe('custom assets', () => {
  /** Calendar-year returns and monthly log returns from a long simulated history. */
  function stats(asset: CustomAsset, years = 20_000) {
    const months = years * 12
    const r = customReturns(customParams(asset), months, 12345)
    const yearly: number[] = []
    let logSum = 0
    const logs = new Float64Array(months)
    for (let y = 0; y < years; y++) {
      let g = 1
      for (let m = 0; m < 12; m++) {
        g *= 1 + r[y * 12 + m]
        logs[y * 12 + m] = Math.log1p(r[y * 12 + m])
      }
      yearly.push(g - 1)
      logSum += Math.log(g)
    }
    const meanY = yearly.reduce((s, v) => s + v, 0) / years
    const sd = Math.sqrt(yearly.reduce((s, v) => s + (v - meanY) ** 2, 0) / (years - 1))
    const m1 = logs.reduce((s, v) => s + v, 0) / months
    const m2 = logs.reduce((s, v) => s + (v - m1) ** 2, 0) / months
    const m4 = logs.reduce((s, v) => s + (v - m1) ** 4, 0) / months
    const sdm = Math.sqrt(m2)
    const beyond4 = logs.filter((v) => Math.abs(v - m1) > 4 * sdm).length / months
    return { compound: Math.exp(logSum / years) - 1, sd, excessKurtosis: m4 / (m2 * m2) - 3, beyond4 }
  }

  it('grows at about the typed average, with about the typed volatility, and fat tails', () => {
    const s = stats({ kind: 'custom', mean: 7, volatility: 15 })
    expect(s.compound).toBeGreaterThan(0.065)
    expect(s.compound).toBeLessThan(0.075)
    expect(s.sd).toBeGreaterThan(0.14)
    expect(s.sd).toBeLessThan(0.16)
    // A bell curve has excess kurtosis 0 and moves beyond 4 standard deviations in about 1 month in 16,000.
    expect(s.excessKurtosis).toBeGreaterThan(2)
    expect(s.beyond4).toBeGreaterThan(5 * 0.0000633)
  })

  it('keeps the average and volatility when crashes are added', () => {
    const s = stats({ kind: 'custom', mean: 8, volatility: 18, crashes: { everyYears: 10, drop: 30 } })
    expect(s.compound).toBeGreaterThan(0.07)
    expect(s.compound).toBeLessThan(0.09)
    expect(s.sd).toBeGreaterThan(0.165)
    expect(s.sd).toBeLessThan(0.195)
    expect(s.excessKurtosis).toBeGreaterThan(5)
  })

  it('warns when the crashes alone are bumpier than the volatility', () => {
    expect(customParams({ kind: 'custom', mean: 5, volatility: 2, crashes: { everyYears: 2, drop: 50 } }).crashesTooBig).toBe(true)
    const p = plan({ phases: [phase({ investment: { kind: 'custom', mean: 5, volatility: 2, crashes: { everyYears: 2, drop: 50 } } })] })
    const h = flatHistory(24, {}, 2)
    expect(preparePrediction(p, h, opts({ runs: 5 })).warnings[0]).toMatch(/crashes alone/)
  })

  it('with no volatility, grows exactly at the typed rate', () => {
    const r = customReturns(customParams({ kind: 'custom', mean: 6, volatility: 0 }), 24, 1)
    let g = 1
    r.forEach((x) => (g *= 1 + x))
    expect(g).toBeCloseTo(1.06 ** 2, 12)
  })

  it('a custom-asset plan with no volatility matches Manual mode at the same rate', () => {
    const p = plan({ phases: [phase({ investment: { kind: 'custom', mean: 7, volatility: 0 } })] })
    const r = runPrediction(preparePrediction(p, flatHistory(24, {}, 2.5), opts({ runs: 5 })))
    expect(r.final.mid).toBeCloseTo(runManual(p).finalBalance, 2)
  })
})

describe('mixes', () => {
  it('drifts during the year and goes back to the target shares once a year', () => {
    // 50/50; A doubles in month 0, B stays flat.
    const a = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]
    const b = new Array(13).fill(0)
    const r = mixReturns([a, b], [50, 50], 13)
    expect(r[0]).toBeCloseTo(0.5, 12) // half the money doubled
    expect(r[12]).toBeCloseTo(0.5, 12) // rebalanced back to 50/50 before month 12
    const c = [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    const d = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    // After month 0, B is 2/3 of the mix, so A doubling in month 1 adds only 1/3.
    expect(mixReturns([c, d], [50, 50], 2)[1]).toBeCloseTo(1 / 3, 12)
  })
})

describe('checks', () => {
  it('asks for an investment before Prediction mode can run, but Manual mode still works without one', () => {
    const p = plan({ phases: [phase({ investment: undefined })] })
    expect(validatePlan(p)).toEqual([])
    expect(predictionProblems(p)[0].message).toMatch(/choose what it’s invested in/)
  })

  it('checks mixes, cash and custom assets', () => {
    expect(investmentProblem({ kind: 'mix', parts: [{ etf: 'A', weight: 60 }, { etf: 'B', weight: 30 }] })).toMatch(/adds up to 90%/)
    expect(investmentProblem({ kind: 'mix', parts: [{ etf: 'A', weight: 60 }, { etf: 'B', weight: 40 }] })).toBeNull()
    expect(investmentProblem({ kind: 'cash', rate: -1 })).toMatch(/savings rate/)
    expect(investmentProblem({ kind: 'custom', mean: 7, volatility: -1 })).toMatch(/volatility/)
    expect(investmentProblem({ kind: 'custom', mean: 7, volatility: 15, crashes: { everyYears: 10, drop: 100 } })).toMatch(/crash drop/)
    expect(predictionProblems(plan({ prediction: { mode: 'prediction', runs: 100 } }))[0].message).toMatch(/Simulations/)
    expect(predictionProblems(plan({ prediction: { mode: 'prediction', percentiles: [50, 50, 90] } }))[0].message).toMatch(/Percentiles/)
  })

  it('old plans (no investment chosen) give exactly the same Manual answer as before', () => {
    const p = plan({ realism: everything, phases: [phase({ investment: undefined })] })
    const withEtf = plan({ realism: everything, phases: [{ ...p.phases[0], investment: { kind: 'etf', etf: 'VAS' } }] })
    expect(runManual(withEtf).finalBalance).toBe(runManual(p).finalBalance)
    expect(compilePlan(p).n).toBe(compilePlan(withEtf).n)
  })
})

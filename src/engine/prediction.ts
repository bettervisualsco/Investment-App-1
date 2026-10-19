// Prediction mode: runs your exact plan through replayed market history
// thousands of times.
//
// What varies: only the returns, inflation and exchange rates. Phases,
// deposits, durations and events are exactly as you entered them.
//
// How each simulation is made:
//   1. Pick chunks of real history (shared block bootstrap, bootstrap.ts) to
//      get one real month for every month of the plan.
//   2. Every series is read from that SAME real month: each phase's asset
//      return, each holding kept separately ("Money you have now"), inflation,
//      and (already folded into the asset columns by the caller) the AUD/USD move. So a month like October 1987 brings its crash
//      to every asset at once, and a high-inflation year brings its inflation.
//   3. Each month's return r is spread over its days: (1 + r)^(1 / days in the
//      month) per day, the same way Manual mode spreads a yearly rate.
//   4. The day-by-day simulation (simulate.ts) runs with that path, so the
//      Fees, Tax and Inflation switches work exactly as in Manual mode.
//
// Custom assets have no history: their months are drawn at random (assets.ts),
// one set per simulation.
//
// Results are repeatable: each simulation's random choices come from the seed
// and the simulation's number, so the same plan, data and seed always give the
// same answer. Changing a deposit keeps the same replayed histories, so you see
// only the effect of your change.

import { CASH_KEY, customParams, customReturns, etfKey, mixReturns, type CustomParams } from './assets'
import { blockBootstrap, countRuns, fanBands, hashSeed, percentileOfSorted } from './bootstrap'
import { compilePlan, type CompiledPlan } from './compile'
import { withPhaseInfo, type CostStep, type ManualResult } from './manual'
import type { MarketPath, SleevePath } from './path'
import { ALL_OFF, simulate, type Switches } from './simulate'
import type { Investment, Plan } from './types'

/**
 * Real monthly history, lined up by month. Every column has one number per month (the same months).
 * Asset columns are total returns already in the plan's currency and BEFORE fees (the Fees switch
 * takes the management fee off, as in Manual mode). Keys: etfKey("VAS"), CASH_KEY.
 */
export interface HistoryTable {
  /** "YYYY-MM" for each month (for labels only). */
  months: string[]
  assets: Record<string, ArrayLike<number>>
  /** Inflation (CPI change) in each month, as a fraction. */
  inflation: ArrayLike<number>
}

export interface PredictionOptions {
  runs: number
  /** Chunk length in months. */
  blockMonths: number
  seed: number
  /** Worst, likely, best (e.g. [10, 50, 90]). */
  percentiles: [number, number, number]
  /** How many single simulations to keep for drawing. Default 5. */
  keepPaths?: number
  /** Called now and then with how many simulations are done. */
  onProgress?: (done: number, total: number) => void
}

export interface Drawdown {
  /** Fraction: 0.35 = fell 35% from its high point. */
  drop: number
  /** Day of the high point and of the low point (month ends). */
  peakDay: number
  troughDay: number
}

export interface PredictionResult {
  runs: number
  historyMonths: number
  percentiles: [number, number, number]
  switches: Switches
  startDay: number
  endDay: number
  /** Day of each chart point. */
  days: Float64Array
  /**
   * Percentile lines at each chart point, in the money shown (today's dollars when Inflation is on).
   * low / mid / high are the chosen percentiles; innerLow / innerHigh are halfway to the middle, for darker shading.
   */
  bands: { low: Float64Array; innerLow: Float64Array; mid: Float64Array; innerHigh: Float64Array; high: Float64Array }
  /** Final amount at each chosen percentile. */
  final: { low: number; mid: number; high: number }
  /** Every simulation's final amount, low to high. */
  finalsSorted: Float64Array
  /** Simulations that ended with less than the money put in (starting balance + deposits − withdrawals). */
  belowPutIn: { count: number; share: number }
  goal: { amount: number; day: number; outsidePlan: boolean; inTodaysDollars: boolean; count: number; share: number } | null
  /** The simulation with the middle final amount: its full details (for totals, the year table and CSV), and its biggest drop. */
  median: { run: number; detail: ManualResult; drawdown: Drawdown | null }
  /** A few single simulations (in the money shown), for drawing. */
  paths: Float64Array[]
  /** How many simulations had a warning of their own (e.g. a withdrawal bigger than the balance). */
  runsWithWarnings: number
  /** Those warnings grouped by kind: how many simulations had each, and one example. Most common first. */
  runWarnings: { count: number; example: string }[]
  warnings: string[]
}

export interface PredictionCost {
  /** Middle (median) line of the same simulations with every switch off. */
  allOffMid: Float64Array
  /** Middle final amount with every switch off. */
  allOff: number
  /** Turning the plan's switches on one at a time (fees → tax → inflation), using the middle final amount each time. */
  steps: CostStep[]
}

type Source =
  | { kind: 'column'; values: ArrayLike<number> }
  | { kind: 'mix'; columns: ArrayLike<number>[]; weights: number[] }
  | { kind: 'custom'; params: CustomParams; id: string }

/** A plan, compiled once, ready to be run against a history table. */
export interface PreparedPrediction {
  compiled: CompiledPlan
  history: HistoryTable
  options: PredictionOptions
  /** Calendar months the plan touches. */
  months: number
  /** Month number (0 = the plan's first month) of each day. */
  monthOf: Int32Array
  /** First day (t) of each month, plus the plan's length at the end. */
  monthFirstT: Int32Array
  /** Days in each month. */
  monthDays: Uint8Array
  /** Day number of the last plan day in each month. */
  monthLastDay: Float64Array
  /** Each phase's first and last month. */
  phaseMonths: { first: number; last: number }[]
  sources: Source[]
  cashPhase: boolean[]
  /** Holdings kept separately (CompiledPlan.kept): where each one's months come from, and whether it's a savings account. */
  sleeveSources: Source[]
  sleeveCash: boolean[]
  warnings: string[]
}

export function preparePrediction(plan: Plan, history: HistoryTable, options: PredictionOptions): PreparedPrediction {
  if (history.months.length === 0) throw new Error('No history to replay.')
  const c = compilePlan(plan)
  const monthOf = new Int32Array(c.n)
  const monthDays: number[] = []
  const monthLastDay: number[] = []
  const monthFirstT: number[] = [0]
  let k = 0
  for (let t = 0; t < c.n; t++) {
    monthOf[t] = k
    if (c.monthEndShare[t] > 0) {
      monthFirstT.push(t + 1)
      monthDays.push(c.dim[t])
      monthLastDay.push(c.startDay + t)
      k++
    }
  }
  const warnings: string[] = []
  const sourceOf = (inv: Investment, label: string, id: string): Source => {
    const column = (key: string) => {
      const values = history.assets[key]
      if (!values) throw new Error(`No history for ${key.replace('etf:', '')}.`)
      return values
    }
    if (inv.kind === 'etf') return { kind: 'column', values: column(etfKey(inv.etf)) }
    if (inv.kind === 'cash') return { kind: 'column', values: column(CASH_KEY) }
    if (inv.kind === 'mix') return { kind: 'mix', columns: inv.parts.map((p) => column(etfKey(p.etf))), weights: inv.parts.map((p) => p.weight) }
    const params = customParams(inv)
    if (params.crashesTooBig) {
      warnings.push(`${label}: the crashes alone are bumpier than the volatility you typed, so the months in between were kept steady. Raise the volatility or make crashes rarer or smaller.`)
    }
    return { kind: 'custom', params, id }
  }
  const sources: Source[] = plan.phases.map((phase) => {
    const inv = phase.investment
    if (!inv) throw new Error(`${phase.name || 'A phase'}: choose what it’s invested in.`)
    return sourceOf(inv, phase.name || 'A phase', phase.id)
  })
  // Holdings kept separately: their own history, read from the same sampled months as everything else.
  const sleeveSources: Source[] = c.kept.map((h) => sourceOf(h.investment!, h.name, `holding:${h.id}`))
  return {
    compiled: c,
    history,
    options,
    months: monthDays.length,
    monthOf,
    monthFirstT: Int32Array.from(monthFirstT),
    monthDays: Uint8Array.from(monthDays),
    monthLastDay: Float64Array.from(monthLastDay),
    phaseMonths: c.ranges.map((r) => ({ first: monthOf[r.start - c.startDay], last: monthOf[r.end - 1 - c.startDay] })),
    sources,
    cashPhase: plan.phases.map((p) => p.investment?.kind === 'cash'),
    sleeveSources,
    sleeveCash: c.kept.map((h) => h.investment?.kind === 'cash'),
    warnings,
  }
}

/** Which real month (index into the history table) each plan month uses, for one simulation. */
export function sampledMonths(prep: PreparedPrediction, run: number): Int32Array {
  return blockBootstrap({
    historyLength: prep.history.months.length,
    months: prep.months,
    runs: 1,
    blockMonths: prep.options.blockMonths,
    seed: hashSeed(prep.options.seed, 'run', run),
  })
}

/** One simulation's market path: a growth, inflation and income factor for every day. */
export interface BuiltPath extends MarketPath {
  /** Each phase's return in each plan month (row = phase), for the drawdown. */
  monthly: Float64Array[]
  /** Each holding kept separately: its return in every plan month. */
  sleeveMonthly?: Float64Array[]
}

const MIN_RETURN = -0.9999

export function buildPath(prep: PreparedPrediction, run: number, reuse?: BuiltPath): BuiltPath {
  const c = prep.compiled
  const { months, monthOf, monthDays } = prep
  const sample = sampledMonths(prep, run)
  const warnings: string[] = []

  /** One investment's return for plan months first..last, read from the sampled months (or drawn, for a custom asset). */
  const fill = (src: Source, first: number, last: number, out: Float64Array, seedKey: string) => {
    const count = last - first + 1
    if (src.kind === 'column') {
      for (let k = first; k <= last; k++) out[k] = src.values[sample[k]]
    } else if (src.kind === 'mix') {
      const parts = src.columns.map((col) => {
        const a = new Float64Array(count)
        for (let j = 0; j < count; j++) a[j] = col[sample[first + j]]
        return a
      })
      out.set(mixReturns(parts, src.weights, count), first)
    } else {
      out.set(customReturns(src.params, count, hashSeed(prep.options.seed, seedKey, src.id, run)), first)
    }
    for (let k = first; k <= last; k++) {
      if (out[k] < MIN_RETURN) {
        out[k] = MIN_RETURN
        if (!warnings.length) warnings.push('A month’s return was −100% or lower, so it was treated as −99.99%.')
      }
    }
  }

  // Each phase's return for each month it touches.
  const monthly = reuse?.monthly ?? prep.sources.map(() => new Float64Array(months))
  prep.sources.forEach((src, p) => fill(src, prep.phaseMonths[p].first, prep.phaseMonths[p].last, monthly[p], 'custom'))

  // Spread each month over its days.
  const growth = reuse?.growth ?? new Float64Array(c.n)
  const inflation = reuse?.inflation ?? new Float64Array(c.n)
  const income = reuse?.income ?? new Float64Array(c.n)
  const infl = prep.history.inflation
  let lastKey = -1
  let g = 1
  let i = 1
  let lastMonth = -1
  for (let t = 0; t < c.n; t++) {
    const k = monthOf[t]
    const p = c.phaseOf[t]
    const key = k * 65536 + p
    if (key !== lastKey) {
      lastKey = key
      const r = monthly[p][k]
      g = r === 0 ? 1 : Math.pow(1 + r, 1 / monthDays[k])
    }
    if (k !== lastMonth) {
      lastMonth = k
      const r = Math.max(-0.99, infl[sample[k]])
      i = r === 0 ? 1 : Math.pow(1 + r, 1 / monthDays[k])
    }
    growth[t] = g
    inflation[t] = i
    // A savings account's whole return is interest (taxed as income). 0 = use the phase's yield.
    income[t] = prep.cashPhase[p] ? g : 0
  }
  if (prep.sleeveSources.length === 0) return { growth, inflation, income, warnings, monthly }

  // Holdings kept separately: every month of the plan, from the same sampled months.
  const sleeveMonthly = reuse?.sleeveMonthly ?? prep.sleeveSources.map(() => new Float64Array(months))
  const sleeves: SleevePath[] =
    reuse?.sleeves ?? prep.sleeveSources.map((_, j) => (prep.sleeveCash[j] ? { growth: new Float64Array(c.n), income: new Float64Array(c.n) } : { growth: new Float64Array(c.n) }))
  prep.sleeveSources.forEach((src, j) => {
    const out = sleeveMonthly[j]
    fill(src, 0, months - 1, out, 'holding')
    const sg = sleeves[j].growth
    const si = sleeves[j].income
    for (let k = 0; k < months; k++) {
      const f = out[k] === 0 ? 1 : Math.pow(1 + out[k], 1 / monthDays[k])
      sg.fill(f, prep.monthFirstT[k], prep.monthFirstT[k + 1])
      // A savings account's whole return is interest.
      if (si) si.fill(f, prep.monthFirstT[k], prep.monthFirstT[k + 1])
    }
  })
  return { growth, inflation, income, warnings, monthly, sleeves, sleeveMonthly }
}

/** The plan's investments' value (per dollar, before fees) at each month end, for one simulation. */
export function marketIndex(prep: PreparedPrediction, path: BuiltPath): Float64Array {
  const c = prep.compiled
  const index = new Float64Array(prep.months + 1)
  index[0] = 1
  let v = 1
  for (let t = 0; t < c.n; t++) {
    v *= path.growth[t]
    if (c.monthEndShare[t] > 0) index[prep.monthOf[t] + 1] = v
  }
  return index
}

/** Biggest fall from a high point to a later low point, with where they were. */
export function drawdownOf(series: ArrayLike<number>): { drop: number; peak: number; trough: number } | null {
  let peak = 0
  let best = { drop: 0, peak: 0, trough: 0 }
  for (let i = 1; i < series.length; i++) {
    if (series[i] > series[peak]) peak = i
    else if (series[peak] > 0) {
      const drop = (series[peak] - series[i]) / series[peak]
      if (drop > best.drop) best = { drop, peak, trough: i }
    }
  }
  return best.drop > 0 ? best : null
}

/** Day number of each chart point (the same points simulate() keeps in `balances`). */
export function chartDays(c: CompiledPlan): Float64Array {
  const every = Math.max(1, Math.ceil(c.n / 720))
  const days = [c.startDay]
  for (let t = 0; t < c.n; t++) if (t === c.n - 1 || (t + 1) % every === 0) days.push(c.startDay + t + 1)
  return Float64Array.from(days)
}

const shown = (inflationOn: boolean, balance: number, cpi: number) => (inflationOn ? balance / cpi : balance)

/** Runs every simulation with the plan's own switches. */
export function runPrediction(prep: PreparedPrediction): PredictionResult {
  const c = prep.compiled
  const { runs, percentiles, onProgress } = prep.options
  const keep = Math.min(runs, prep.options.keepPaths ?? 5)
  const sw: Switches = { fees: c.realism.fees, tax: c.realism.tax, inflation: c.realism.inflation }
  const days = chartDays(c)
  const points = days.length
  const values = new Float64Array(runs * points)
  const finals = new Float64Array(runs)
  const nets = new Float64Array(runs)
  const reached = new Uint8Array(runs)
  const paths: Float64Array[] = []
  let goalInfo: PredictionResult['goal'] = null
  let runsWithWarnings = 0
  const kinds = new Map<string, { count: number; example: string }>()
  let path: BuiltPath | undefined

  const step = Math.max(1, Math.floor(runs / 50))
  for (let r = 0; r < runs; r++) {
    path = buildPath(prep, r, path)
    const sim = simulate(c, path, { switches: sw, detail: false })
    if (sim.balances.length !== points) throw new Error('Chart points don’t line up.')
    const base = r * points
    for (let j = 0; j < points; j++) values[base + j] = shown(sw.inflation, sim.balances[j], sim.cpis[j])
    if (r < keep) paths.push(values.slice(base, base + points))
    finals[r] = sw.inflation ? sim.finalReal : sim.finalBalance
    // Distributions paid to you in cash left the account but weren't lost, so they count as money back.
    nets[r] = sw.inflation ? sim.real.netContributed - sim.real.paidOut : sim.netContributed - sim.totalPaidOut
    if (sim.goal) {
      reached[r] = sim.goal.reached ? 1 : 0
      goalInfo ??= { amount: sim.goal.amount, day: sim.goal.day, outsidePlan: sim.goal.outsidePlan, inTodaysDollars: sim.goal.inTodaysDollars, count: 0, share: 0 }
    }
    const own = sim.warnings.slice(c.warnings.length + path.warnings.length)
    if (own.length > 0) {
      runsWithWarnings++
      // Group by wording, ignoring the amounts and dates that differ between simulations.
      for (const kind of new Set(own.map((w) => w.replace(/\$[\d,.]+/g, '$').replace(/\d+/g, '#')))) {
        const k = kinds.get(kind)
        if (k) k.count++
        else kinds.set(kind, { count: 1, example: own.find((w) => w.replace(/\$[\d,.]+/g, '$').replace(/\d+/g, '#') === kind)! })
      }
    }
    if (onProgress && ((r + 1) % step === 0 || r === runs - 1)) onProgress(r + 1, runs)
  }

  const [lo, mid, hi] = percentiles
  const [low, innerLow, middle, innerHigh, high] = fanBands(values, runs, points, [lo, (lo + mid) / 2, mid, (mid + hi) / 2, hi])
  const finalsSorted = finals.slice().sort()
  if (goalInfo) Object.assign(goalInfo, countRuns(runs, (r) => reached[r] === 1))

  // The simulation with the middle final amount (the lower one of the middle two, for an even count).
  const order = Array.from({ length: runs }, (_, r) => r).sort((a, b) => finals[a] - finals[b] || a - b)
  const medianRun = order[Math.floor((runs - 1) / 2)]
  const medianPath = buildPath(prep, medianRun)
  const detail = withPhaseInfo(c, simulate(c, medianPath, { switches: sw }))
  // With holdings kept separately, the drop is measured across all your investments together.
  const dd = drawdownOf(detail.portfolioIndex ?? marketIndex(prep, medianPath))
  const drawdown = dd && {
    drop: dd.drop,
    peakDay: dd.peak === 0 ? c.startDay : prep.monthLastDay[dd.peak - 1],
    troughDay: prep.monthLastDay[dd.trough - 1],
  }

  return {
    runs,
    historyMonths: prep.history.months.length,
    percentiles,
    switches: sw,
    startDay: c.startDay,
    endDay: c.endDay,
    days,
    bands: { low, innerLow, mid: middle, innerHigh, high },
    final: { low: percentileOfSorted(finalsSorted, lo), mid: percentileOfSorted(finalsSorted, mid), high: percentileOfSorted(finalsSorted, hi) },
    finalsSorted,
    belowPutIn: countRuns(runs, (r) => finals[r] < nets[r] - 0.5),
    goal: goalInfo,
    median: { run: medianRun, detail, drawdown },
    paths,
    runsWithWarnings,
    runWarnings: [...kinds.values()].sort((a, b) => b.count - a.count),
    warnings: [...prep.warnings],
  }
}

/** Middle final amount (and, if asked, the middle line) of every simulation with the given switches. */
function runPass(prep: PreparedPrediction, sw: Switches, wantLine: boolean, progress?: (done: number) => void) {
  const c = prep.compiled
  const runs = prep.options.runs
  const days = chartDays(c)
  const points = days.length
  const finals = new Float64Array(runs)
  const values = wantLine ? new Float64Array(runs * points) : null
  let path: BuiltPath | undefined
  for (let r = 0; r < runs; r++) {
    path = buildPath(prep, r, path)
    const sim = simulate(c, path, { switches: sw, detail: false })
    finals[r] = sw.inflation ? sim.finalReal : sim.finalBalance
    if (values) for (let j = 0; j < points; j++) values[r * points + j] = shown(sw.inflation, sim.balances[j], sim.cpis[j])
    progress?.(r + 1)
  }
  finals.sort()
  const mid = prep.options.percentiles[1]
  return { final: percentileOfSorted(finals, mid), line: values ? fanBands(values, runs, points, [mid])[0] : null }
}

/**
 * "Show the cost" for Prediction mode: the same simulations with every switch off, then with the
 * plan's switches turned on one at a time (fees → tax → inflation). Each cost is the change in the
 * middle final amount. Pass the main result so its final step isn't worked out twice.
 */
export function runPredictionCost(prep: PreparedPrediction, main: PredictionResult): PredictionCost {
  const r = prep.compiled.realism
  const on = (['fees', 'tax', 'inflation'] as const).filter((k) => r[k])
  const passes = on.length // all-off, plus each step except the last (that's `main`)
  const runs = prep.options.runs
  const total = passes * runs
  let done = 0
  const step = Math.max(1, Math.floor(runs / 25))
  const tick = (n: number) => {
    if (prep.options.onProgress && (n % step === 0 || n === runs)) prep.options.onProgress(done + n, total)
  }
  const allOffPass = runPass(prep, ALL_OFF, true, tick)
  done += runs
  const steps: CostStep[] = []
  const current: Switches = { ...ALL_OFF }
  let before = allOffPass.final
  on.forEach((key, i) => {
    current[key] = true
    let after: number
    if (i === on.length - 1) after = main.final.mid
    else {
      after = runPass(prep, { ...current }, false, tick).final
      done += runs
    }
    steps.push({ switch: key, after, cost: before - after })
    before = after
  })
  return { allOffMid: allOffPass.line!, allOff: allOffPass.final, steps }
}

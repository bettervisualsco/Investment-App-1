// Shared tools for "replaying history" predictions (Prediction mode, ETF
// prediction lines, inflation predictions). No screen code, no data loading:
// it only works with month numbers and plain numbers.
//
// Method: circular block bootstrap. Each simulated path is built by picking
// random chunks ("blocks") of real history, default 12 months long, and
// joining them end to end. Inside a block the months stay in their real
// order, so real streaks (crashes, high-inflation years) survive. The history
// is treated as a loop, so the last months of history are as likely to be
// picked as any others. The caller uses the SAME month number for every
// series (asset returns, inflation, AUD/USD), so their real-world links stay
// intact.
//
// Results are repeatable: the same seed always gives the same paths.

/** A small, fast random number generator that always gives the same numbers for the same seed (mulberry32). Returns numbers in [0, 1). */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Turns any mix of text and numbers into a seed (FNV-1a hash), e.g. hashSeed(userSeed, 'VAS', 2000). */
export function hashSeed(...parts: (string | number)[]): number {
  let h = 0x811c9dc5
  const text = parts.join('\u0001')
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export interface BootstrapOptions {
  /** Number of months of history to sample from. Month numbers returned are 0 … historyLength − 1. */
  historyLength: number
  /** How many months each simulated path needs. */
  months: number
  /** How many paths. */
  runs: number
  /** Length of each chunk of real history, in months. Default 12. Clamped to 1 … historyLength. */
  blockMonths?: number
  seed: number
}

/**
 * For every run, which history month to use for each simulated month.
 * Returns one flat array: run r, month k is at [r * months + k].
 */
export function blockBootstrap(opts: BootstrapOptions): Int32Array {
  const { historyLength: n, months, runs, seed } = opts
  if (!Number.isInteger(n) || n < 1) throw new Error('blockBootstrap: need at least 1 month of history')
  if (!Number.isInteger(months) || months < 0 || !Number.isInteger(runs) || runs < 0) throw new Error('blockBootstrap: months and runs must be whole numbers')
  const block = Math.min(n, Math.max(1, Math.round(opts.blockMonths ?? 12)))
  const rng = makeRng(seed)
  const out = new Int32Array(runs * months)
  for (let r = 0; r < runs; r++) {
    const base = r * months
    let k = 0
    while (k < months) {
      const start = Math.floor(rng() * n)
      for (let j = 0; j < block && k < months; j++, k++) out[base + k] = (start + j) % n
    }
  }
  return out
}

/** The p-th percentile (0–100) of numbers that are already sorted from low to high, with straight-line blending between neighbours. */
export function percentileOfSorted(sorted: ArrayLike<number>, p: number): number {
  const n = sorted.length
  if (n === 0) return NaN
  const pos = (Math.min(100, Math.max(0, p)) / 100) * (n - 1)
  const lo = Math.floor(pos)
  const hi = Math.min(n - 1, lo + 1)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

/**
 * Percentile lines across many runs. `values` is flat: run r, point t at
 * [r * points + t]. Returns one array per requested percentile, each with
 * `points` numbers (e.g. [10, 50, 90] → worst, likely, best lines).
 */
export function fanBands(values: ArrayLike<number>, runs: number, points: number, percentiles: number[]): Float64Array[] {
  const bands = percentiles.map(() => new Float64Array(points))
  const column = new Float64Array(runs)
  for (let t = 0; t < points; t++) {
    for (let r = 0; r < runs; r++) column[r] = values[r * points + t]
    column.sort()
    percentiles.forEach((p, i) => (bands[i][t] = percentileOfSorted(column, p)))
  }
  return bands
}

/** Biggest drop from a high point to a later low point, as a fraction (0.35 = a 35% fall). 0 if it never falls. */
export function maxDrawdown(series: ArrayLike<number>): number {
  let peak = -Infinity
  let worst = 0
  for (let i = 0; i < series.length; i++) {
    const v = series[i]
    if (v > peak) peak = v
    else if (peak > 0) worst = Math.max(worst, (peak - v) / peak)
  }
  return worst
}

/** How many runs meet a test, and what share that is: e.g. "1,624 of 2,000 (81%)". */
export function countRuns(runs: number, test: (run: number) => boolean): { count: number; share: number } {
  let count = 0
  for (let r = 0; r < runs; r++) if (test(r)) count++
  return { count, share: runs > 0 ? count / runs : 0 }
}

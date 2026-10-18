// What each phase is invested in, as seen by Prediction mode: which history
// columns it reads, and how custom assets and mixes turn into monthly returns.
// No data loading here: the history table is handed in (see prediction.ts).

import { makeRng } from './bootstrap'
import type { CustomAsset, Investment, Plan } from './types'

/** History column key for an ETF's monthly total return. */
export const etfKey = (id: string) => `etf:${id}`
/** History column key for the cash/savings account (RBA cash rate in AUD plans). */
export const CASH_KEY = 'cash'

/** The ETF ids a plan's phases are invested in (single ETFs and every part of a mix). */
export function etfsUsed(plan: Plan): string[] {
  const ids = new Set<string>()
  for (const phase of plan.phases) {
    const inv = phase.investment
    if (inv?.kind === 'etf') ids.add(inv.etf)
    if (inv?.kind === 'mix') inv.parts.forEach((p) => ids.add(p.etf))
  }
  return [...ids]
}

/** True if any phase is a cash/savings account. */
export function usesCash(plan: Plan): boolean {
  return plan.phases.some((p) => p.investment?.kind === 'cash')
}

/** The history columns an investment reads. */
export function historyKeysOf(inv: Investment): string[] {
  if (inv.kind === 'etf') return [etfKey(inv.etf)]
  if (inv.kind === 'mix') return inv.parts.map((p) => etfKey(p.etf))
  if (inv.kind === 'cash') return [CASH_KEY]
  return []
}

// ---------------------------------------------------------------------------
// Custom assets
//
// Each month's return is drawn at random, with "fat tails": big moves (both
// ways) happen more often than a smooth bell curve would allow, like real
// markets. Method: the month's log return (the continuously compounded
// return) is
//
//     drift + spread × T  (+ a crash, now and then)
//
// where T comes from a Student-t distribution with 5 degrees of freedom,
// scaled so its spread (standard deviation) is 1. Optional crashes are a
// sudden fall of `drop`% in one month, on average once every `everyYears`.
//
// The numbers are chosen so that, over many years:
//   - the typical (compound) yearly growth is the `mean` you typed. With
//     crashes on, the drift is raised to make up for them, so the average
//     stays the same and crashes only add bumpiness.
//   - yearly returns vary by about the `volatility` you typed (their standard
//     deviation), crashes included. If the crashes alone are bumpier than
//     that, the in-between months are kept steady and a warning is given.
// (Both are worked out treating the 12 ordinary months of a year as adding up
// to a bell curve, which is close: fat tails mostly show up month to month.)

/** Degrees of freedom for the Student-t: 5 gives clearly fat tails while keeping the spread well behaved. */
export const T_DEGREES = 5

export interface CustomParams {
  /** Monthly log-return drift. */
  drift: number
  /** Monthly log-return spread of the Student-t part. */
  spread: number
  /** Chance of a crash in any month. */
  crashChance: number
  /** Log return in a crash month (on top of the normal month). */
  crashLog: number
  /** The crashes alone are bumpier than the volatility typed. */
  crashesTooBig: boolean
}

export function customParams(a: CustomAsset): CustomParams {
  const mu = a.mean / 100
  const sigma = a.volatility / 100
  const p = a.crashes ? 1 / (12 * a.crashes.everyYears) : 0
  const c = a.crashes ? Math.log(1 - a.crashes.drop / 100) : 0
  // A year's log return L = (12 ordinary months, about normal with mean 12·drift and variance 12·s²)
  // + (number of crashes × c). Pick drift so E[L] = ln(1 + mu): the typical compound growth.
  const drift = Math.log(1 + mu) / 12 - p * c
  // Then pick s so the yearly return R = e^L − 1 has standard deviation sigma:
  //   Var(R) = A²·(B2·x² − B1²·x), with x = e^(12·s²), A = e^(12·drift),
  //   B1 = (1 − p + p·e^c)^12 and B2 = (1 − p + p·e^(2c))^12 (the crashes' part).
  const A = Math.exp(12 * drift)
  const B1 = Math.pow(1 - p + p * Math.exp(c), 12)
  const B2 = Math.pow(1 - p + p * Math.exp(2 * c), 12)
  const x = (B1 * B1 + Math.sqrt(B1 ** 4 + (4 * B2 * sigma * sigma) / (A * A))) / (2 * B2)
  const crashesTooBig = x < 1 - 1e-12
  return { drift, spread: Math.sqrt(Math.max(0, Math.log(x) / 12)), crashChance: p, crashLog: c, crashesTooBig }
}

/** Ordinary months are capped at 12 standard deviations either way, so a freak draw can't produce an impossible month. */
const T_CAP = 12

/** Standard normal numbers from a uniform random source (Box–Muller), two at a time. */
export function makeNormal(rng: () => number): () => number {
  let spare: number | null = null
  return () => {
    if (spare !== null) {
      const s = spare
      spare = null
      return s
    }
    let u = 0
    while (u <= 1e-300) u = rng()
    const v = rng()
    const r = Math.sqrt(-2 * Math.log(u))
    spare = r * Math.sin(2 * Math.PI * v)
    return r * Math.cos(2 * Math.PI * v)
  }
}

/** Student-t numbers with `df` degrees of freedom, scaled to a standard deviation of 1. */
export function makeStudentT(rng: () => number, df = T_DEGREES): () => number {
  const normal = makeNormal(rng)
  const scale = Math.sqrt((df - 2) / df)
  return () => {
    let chi2 = 0
    for (let i = 0; i < df; i++) {
      const z = normal()
      chi2 += z * z
    }
    return (normal() / Math.sqrt(chi2 / df)) * scale
  }
}

/** `months` simulated monthly returns (0.01 = +1%) for a custom asset. Same seed → same returns. */
export function customReturns(params: CustomParams, months: number, seed: number, out = new Float64Array(months)): Float64Array {
  const rng = makeRng(seed)
  const t = makeStudentT(rng)
  for (let k = 0; k < months; k++) {
    let x = params.drift + params.spread * Math.max(-T_CAP, Math.min(T_CAP, t()))
    if (params.crashChance > 0 && rng() < params.crashChance) x += params.crashLog
    out[k] = Math.expm1(x)
  }
  return out
}

// ---------------------------------------------------------------------------
// Mixes

/**
 * Monthly returns of a mix that is put back to its target shares once a year.
 * `parts[i][k]` is part i's return in month k; `weights` are the target shares (any scale).
 * Between rebalances each part's share drifts with its own returns. Rebalancing happens at the
 * start of months 0, 12, 24… (month 0 is the phase's first month).
 */
export function mixReturns(parts: ArrayLike<number>[], weights: number[], months: number, out = new Float64Array(months)): Float64Array {
  const total = weights.reduce((s, w) => s + w, 0)
  const target = weights.map((w) => w / total)
  const value = target.slice()
  for (let k = 0; k < months; k++) {
    if (k % 12 === 0) for (let i = 0; i < value.length; i++) value[i] = target[i]
    let before = 0
    let after = 0
    for (let i = 0; i < value.length; i++) {
      before += value[i]
      value[i] *= 1 + parts[i][k]
      after += value[i]
    }
    out[k] = before > 0 ? after / before - 1 : 0
  }
  return out
}

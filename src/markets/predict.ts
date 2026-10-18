// Prediction lines for an ETF's chart: worst / likely / best from today's price, by replaying
// chunks of the ETF's long-run monthly history (its real history, plus a "proxy" index before it
// existed, with its fee taken off; see docs/DATA_FORMAT.md). Uses the app's shared block
// bootstrap, with a fixed seed so the lines only change when the data changes.
// An estimate based on history, never a promise.

import { blockBootstrap, fanBands, hashSeed } from '../engine/bootstrap'
import { alignedMonths } from '../data/decode'
import type { MonthlyFile } from '../data/types'

export type Horizon = 1 | 5 | 10 | 20
export const HORIZONS: Horizon[] = [1, 5, 10, 20]

/** Worst, likely and best: the 10th, 50th and 90th percentiles of all the simulated paths. */
export const PREDICTION_PERCENTILES = [10, 50, 90] as const

export interface PredictionInput {
  monthly: MonthlyFile
  etfId: string
  years: Horizon
  /** Show a US-listed ETF in A$: each month's US$ return is converted with that same month's AUD/USD move. */
  inAud?: boolean
  /**
   * Price only (no distributions): each month's total return has the typical distribution yield
   * (yearly %, e.g. 3.2) taken off, because a fund's price drops when it pays a distribution.
   */
  priceOnlyYield?: number
  runs?: number
  blockMonths?: number
  /** Leave out to use the fixed seed for this ETF. */
  seed?: number
}

export interface PredictionLines {
  /** Multipliers of today's price at month 0 … months (index 0 is always 1). */
  worst: Float64Array
  likely: Float64Array
  best: Float64Array
  months: number
  runs: number
  seed: number
  /** The history the months were sampled from. */
  historyFrom: string
  historyTo: string
  historyMonths: number
  /** Which history months came from the real ETF (rather than its proxy). */
  realFrom: string | null
}

/** The fixed seed for an ETF's prediction lines (the same every time the app opens). */
export function predictionSeed(etfId: string, inAud: boolean, priceOnly: boolean): number {
  return hashSeed('markets-prediction', etfId, inAud ? 'AUD' : 'own', priceOnly ? 'price' : 'total')
}

/** The monthly returns that predictions sample from, as fractions, one per real month. */
export function historyReturns(monthly: MonthlyFile, etfId: string, inAud = false, priceOnlyYield?: number): { months: string[]; returns: number[] } {
  const etf = monthly.etfs[etfId]
  if (!etf) throw new Error(`No long-run history for ${etfId}`)
  const convert = inAud && etf.currency === 'USD'
  const keys = convert ? [`etf:${etfId}`, 'audusd'] : [`etf:${etfId}`]
  const { months, columns } = alignedMonths(monthly, keys)
  const own = columns[`etf:${etfId}`]
  const fx = convert ? columns.audusd : null
  const yieldMonthly = priceOnlyYield ? priceOnlyYield / 100 / 12 : 0
  const returns = own.map((r, i) => {
    // US$ return → A$ return: (1 + r) / (1 + change in US$ per A$1) − 1
    let x = fx ? (1 + r) / (1 + fx[i]) - 1 : r
    if (yieldMonthly) x = (1 + x) / (1 + yieldMonthly) - 1
    return x
  })
  return { months, returns }
}

export function predictLines(input: PredictionInput): PredictionLines {
  const { monthly, etfId, years } = input
  const runs = input.runs ?? 2000
  const months = years * 12
  const inAud = !!input.inAud
  const seed = input.seed ?? predictionSeed(etfId, inAud, input.priceOnlyYield !== undefined)
  const hist = historyReturns(monthly, etfId, inAud, input.priceOnlyYield)
  const n = hist.returns.length
  if (n < 12) throw new Error(`Not enough history for ${etfId}`)

  const picks = blockBootstrap({ historyLength: n, months, runs, blockMonths: input.blockMonths ?? 12, seed })
  const points = months + 1
  const values = new Float64Array(runs * points)
  for (let r = 0; r < runs; r++) {
    let v = 1
    values[r * points] = 1
    for (let k = 0; k < months; k++) {
      v *= 1 + hist.returns[picks[r * months + k]]
      values[r * points + k + 1] = v
    }
  }
  const [worst, likely, best] = fanBands(values, runs, points, [...PREDICTION_PERCENTILES])
  return {
    worst,
    likely,
    best,
    months,
    runs,
    seed,
    historyFrom: hist.months[0],
    historyTo: hist.months[n - 1],
    historyMonths: n,
    realFrom: monthly.etfs[etfId].realFrom,
  }
}

/** The average yearly rate a multiplier works out to over `months` (e.g. 1.967 over 120 months → 7%). */
export function yearlyFromMultiplier(multiplier: number, months: number): number {
  return Math.pow(multiplier, 12 / months) - 1
}

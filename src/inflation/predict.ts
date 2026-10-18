// Inflation predictions: replaying real inflation history with the shared block bootstrap
// (src/engine/bootstrap.ts). Pure functions, no screen code.
//
// Each simulated future is built from random 12-month chunks of real monthly inflation (from the
// chosen history window), joined end to end. The same seed always gives the same answer, so the
// chart only changes when the data or the choices change. It is an estimate based on history:
// it doesn't know about today's conditions (interest rates, wages, oil prices…).

import { blockBootstrap, fanBands, hashSeed, percentileOfSorted } from '../engine/bootstrap'

export const PREDICTION_RUNS = 2000
export const PREDICTION_BLOCK_MONTHS = 12
/** Worst (high inflation), likely, best (low inflation). */
export const PREDICTION_PERCENTILES = { low: 10, mid: 50, high: 90 } as const
/** The fan chart goes up to 30 years ahead; buying power is worked out up to 50. */
export const MAX_CHART_YEARS = 30
export const MAX_YEARS = 50
const BASE_SEED = 20261018

export interface PredictionInput {
  /** Real monthly inflation to sample from (fractions), oldest first. */
  history: number[]
  /** The latest 12 real months (fractions), oldest first: point 0 is their yearly figure, and the first future year's 12-month figures include them. */
  recent: number[]
  /** Something that names the choice (country, window), mixed into the fixed seed. */
  seedKey: string
  runs?: number
  blockMonths?: number
  chartYears?: number
  years?: number
}

export interface Band {
  low: Float64Array
  mid: Float64Array
  high: Float64Array
}

export interface InflationPrediction {
  runs: number
  chartMonths: number
  /**
   * Yearly inflation (rise over the previous 12 months, as a fraction) at each future month
   * 0 … chartMonths. Point 0 is the latest real figure.
   */
  yearly: Band
  /** Average yearly inflation from now to each future month 1 … chartMonths (index 0 = month 0, same as yearly[0]). */
  average: Band
  /** How much prices have grown after each whole year (1 … years): run r, year y at [r * (years + 1) + y]; year 0 is 1. */
  growthByYear: Float64Array
  years: number
}

/** Runs the replay. Fast enough to run on the screen's thread (about 0.1 s for 2,000 runs). */
export function predictInflation(input: PredictionInput): InflationPrediction {
  const runs = input.runs ?? PREDICTION_RUNS
  const years = input.years ?? MAX_YEARS
  const chartMonths = Math.min(years, input.chartYears ?? MAX_CHART_YEARS) * 12
  const months = years * 12
  const n = input.history.length
  if (n < 12) throw new Error('predictInflation: need at least 12 months of history')
  const logHist = input.history.map((x) => Math.log1p(x))
  const last12 = input.recent.slice(-12).map((x) => Math.log1p(x))
  const logRecent = last12.slice(-11)
  const picks = blockBootstrap({ historyLength: n, months, runs, blockMonths: input.blockMonths ?? PREDICTION_BLOCK_MONTHS, seed: hashSeed(BASE_SEED, 'inflation', input.seedKey) })

  const points = chartMonths + 1
  const yearlyVals = new Float64Array(runs * points)
  const averageVals = new Float64Array(runs * points)
  const growthByYear = new Float64Array(runs * (years + 1))
  const window = new Float64Array(12) // the last 12 months' log changes, as a ring
  const latestYearly = Math.expm1(last12.reduce((a, b) => a + b, 0))

  for (let r = 0; r < runs; r++) {
    // start the ring with the real recent months (and nothing before them if fewer than 11)
    window.fill(0)
    let ringSum = 0
    for (let i = 0; i < logRecent.length; i++) {
      window[12 - logRecent.length + i - 1] = logRecent[i]
      ringSum += logRecent[i]
    }
    let pos = 11
    let cum = 0
    yearlyVals[r * points] = latestYearly
    averageVals[r * points] = latestYearly
    growthByYear[r * (years + 1)] = 1
    for (let k = 1; k <= months; k++) {
      const x = logHist[picks[r * months + k - 1]]
      ringSum += x - window[pos]
      window[pos] = x
      pos = (pos + 1) % 12
      cum += x
      if (k <= chartMonths) {
        yearlyVals[r * points + k] = Math.expm1(ringSum)
        averageVals[r * points + k] = Math.expm1((cum * 12) / k)
      }
      if (k % 12 === 0) growthByYear[r * (years + 1) + k / 12] = Math.exp(cum)
    }
  }

  const ps = [PREDICTION_PERCENTILES.low, PREDICTION_PERCENTILES.mid, PREDICTION_PERCENTILES.high]
  const [yl, ym, yh] = fanBands(yearlyVals, runs, points, ps)
  const [al, am, ah] = fanBands(averageVals, runs, points, ps)
  return { runs, chartMonths, yearly: { low: yl, mid: ym, high: yh }, average: { low: al, mid: am, high: ah }, growthByYear, years }
}

/**
 * How prices grow between two future whole years (0 = now), across all runs: the low, likely and
 * high multipliers. Each run uses its own path for both years, so the range stays honest.
 */
export function growthBetween(pred: InflationPrediction, fromYear: number, toYear: number): { low: number; mid: number; high: number } {
  const w = pred.years + 1
  const vals = new Float64Array(pred.runs)
  for (let r = 0; r < pred.runs; r++) vals[r] = pred.growthByYear[r * w + toYear] / pred.growthByYear[r * w + fromYear]
  vals.sort()
  return {
    low: percentileOfSorted(vals, PREDICTION_PERCENTILES.low),
    mid: percentileOfSorted(vals, PREDICTION_PERCENTILES.mid),
    high: percentileOfSorted(vals, PREDICTION_PERCENTILES.high),
  }
}

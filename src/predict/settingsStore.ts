// Prediction defaults from Settings: percentiles, number of simulations and
// the random seed. Kept on this device (localStorage, its own small key). A
// plan can override them in its own prediction settings.

import { useSyncExternalStore } from 'react'
import { percentilesOk, MAX_RUNS, MIN_RUNS } from '../engine/validate'
import type { HistoryWindowKind, Plan, PredictionSettings } from '../engine/types'

export interface PredictionDefaults {
  percentiles: [number, number, number]
  runs: number
  seed: number
}

export const BUILT_IN_DEFAULTS: PredictionDefaults = { percentiles: [10, 50, 90], runs: 2000, seed: 1 }
export const DEFAULT_BLOCK_MONTHS = 12

const KEY = 'investment-planner.prediction-defaults'

/** Keeps only valid values from what was saved; anything else falls back to the built-in default. */
export function cleanDefaults(raw: unknown): PredictionDefaults {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<PredictionDefaults>
  return {
    percentiles: Array.isArray(r.percentiles) && percentilesOk(r.percentiles) ? [r.percentiles[0], r.percentiles[1], r.percentiles[2]] : BUILT_IN_DEFAULTS.percentiles,
    runs: Number.isInteger(r.runs) && r.runs! >= MIN_RUNS && r.runs! <= MAX_RUNS ? r.runs! : BUILT_IN_DEFAULTS.runs,
    seed: Number.isInteger(r.seed) && r.seed! >= 0 && r.seed! <= 4294967295 ? r.seed! : BUILT_IN_DEFAULTS.seed,
  }
}

function load(): PredictionDefaults {
  try {
    const text = localStorage.getItem(KEY)
    return cleanDefaults(text ? JSON.parse(text) : null)
  } catch {
    return BUILT_IN_DEFAULTS
  }
}

let current: PredictionDefaults | null = null
const listeners = new Set<() => void>()

export function getPredictionDefaults(): PredictionDefaults {
  current ??= load()
  return current
}

export function setPredictionDefaults(next: Partial<PredictionDefaults>) {
  current = cleanDefaults({ ...getPredictionDefaults(), ...next })
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    // Private browsing or storage full: the setting still works until the app is closed.
  }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function usePredictionDefaults(): PredictionDefaults {
  return useSyncExternalStore(subscribe, getPredictionDefaults, getPredictionDefaults)
}

export interface ResolvedPrediction {
  mode: 'manual' | 'prediction'
  window: HistoryWindowKind
  windowFrom: number
  windowTo: number
  blockMonths: number
  runs: number
  percentiles: [number, number, number]
  seed: number
  /** The seed came from Settings (not re-rolled for this plan). */
  defaultSeed: boolean
  showPaths: boolean
}

/** A plan's prediction settings, with anything missing taken from the Settings defaults. */
export function resolvePrediction(s: PredictionSettings | undefined, d: PredictionDefaults): ResolvedPrediction {
  return {
    mode: s?.mode ?? 'manual',
    window: s?.window ?? 'full',
    windowFrom: s?.windowFrom ?? 1990,
    windowTo: s?.windowTo ?? new Date().getFullYear(),
    blockMonths: s?.blockMonths ?? DEFAULT_BLOCK_MONTHS,
    runs: s?.runs ?? d.runs,
    percentiles: s?.percentiles ?? d.percentiles,
    seed: s?.seed ?? d.seed,
    defaultSeed: s?.seed === undefined,
    showPaths: s?.showPaths ?? false,
  }
}

/** Changes some of a plan's prediction settings. */
export function withPrediction(plan: Plan, patch: Partial<PredictionSettings>): Plan {
  return { ...plan, prediction: { mode: 'manual', ...plan.prediction, ...patch } }
}

/** A new random seed for "Re-roll". */
export function newSeed(): number {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0]
  } catch {
    return Math.floor(Math.random() * 4294967296)
  }
}

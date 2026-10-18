// Messages between the screen and the prediction Web Worker.

import type { HistoryTable, PredictionCost, PredictionResult } from '../engine/prediction'
import type { Plan } from '../engine/types'

export interface PredictionJob {
  id: number
  plan: Plan
  history: HistoryTable
  runs: number
  blockMonths: number
  seed: number
  percentiles: [number, number, number]
  /** Also work out "Show the cost" (after the main result is sent). */
  cost: boolean
}

export type WorkerMessage =
  | { id: number; type: 'progress'; stage: 'main' | 'cost'; done: number; total: number }
  | { id: number; type: 'result'; result: PredictionResult; ms: number }
  | { id: number; type: 'cost'; cost: PredictionCost }
  | { id: number; type: 'error'; message: string }

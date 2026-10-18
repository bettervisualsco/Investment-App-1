// The Planner's link to Prediction mode: builds the history for the plan from
// the market data, sends it to the Web Worker, and keeps the latest result.
// Recalculates by itself when the plan changes or new market data arrives
// (useDataFile reloads monthly.json whenever the data sync saves a new copy).

import { useEffect, useMemo, useRef, useState } from 'react'
import { useDataFile, type MonthlyFile } from '../data'
import type { PredictionCost, PredictionResult } from '../engine/prediction'
import type { Plan } from '../engine/types'
import { predictionProblems, validatePlan, type PlanProblem } from '../engine/validate'
import { buildHistory, type HistoryInfo } from './history'
import type { PredictionJob, WorkerMessage } from './protocol'
import { resolvePrediction, usePredictionDefaults, type ResolvedPrediction } from './settingsStore'

export interface PredictionState {
  /** loading: waiting for market data · blocked: the plan or settings need fixing · running · done · error */
  status: 'off' | 'loading' | 'noData' | 'blocked' | 'running' | 'done' | 'error'
  settings: ResolvedPrediction
  problems: PlanProblem[]
  /** Why the history couldn't be used (e.g. the window is too short). */
  historyProblem: string | null
  history: HistoryInfo | null
  progress: { stage: 'main' | 'cost'; done: number; total: number } | null
  /** The latest finished result. While a new one is being worked out, this is the previous one (stale). */
  result: PredictionResult | null
  cost: PredictionCost | null
  stale: boolean
  error: string | null
  /** How long the last run took, ms. */
  ms: number | null
}

interface RunState {
  key: string
  progress: PredictionState['progress']
  result: PredictionResult | null
  resultKey: string | null
  cost: PredictionCost | null
  costKey: string | null
  error: string | null
  ms: number | null
}

/** Wait this long after the last change before starting, so typing doesn't start dozens of runs. */
const DEBOUNCE_MS = 250

export function usePrediction(plan: Plan, enabled: boolean): PredictionState {
  const defaults = usePredictionDefaults()
  const settings = resolvePrediction(plan.prediction, defaults)
  const monthly = useDataFile<MonthlyFile>('monthly.json')

  const problems = useMemo(() => (enabled ? [...validatePlan(plan), ...predictionProblems(plan)] : []), [plan, enabled])
  const build = useMemo(() => {
    if (!enabled || !monthly.data || problems.length > 0) return null
    return buildHistory(monthly.data, plan, { window: settings.window, from: settings.windowFrom, to: settings.windowTo })
  }, [enabled, monthly.data, problems, plan, settings.window, settings.windowFrom, settings.windowTo])

  const wantCost = !!plan.realism?.showCost && !!(plan.realism.fees || plan.realism.tax || plan.realism.inflation)
  const job = useMemo(() => {
    if (!build?.ok) return null
    const j: Omit<PredictionJob, 'id'> = {
      // The name and the "show paths" switch don't change the numbers.
      plan: { ...plan, name: '', prediction: plan.prediction && { ...plan.prediction, showPaths: undefined } },
      history: build.table,
      runs: settings.runs,
      blockMonths: settings.blockMonths,
      seed: settings.seed,
      percentiles: settings.percentiles,
      cost: wantCost,
    }
    return j
  }, [build, plan, settings.runs, settings.blockMonths, settings.seed, settings.percentiles, wantCost])

  // A fingerprint of the job: the plan, the settings and the data's identity.
  const dataId = useRef(new WeakMap<object, number>())
  const nextDataId = useRef(1)
  let key = ''
  if (job && monthly.data) {
    if (!dataId.current.has(monthly.data)) dataId.current.set(monthly.data, nextDataId.current++)
    key = `${dataId.current.get(monthly.data)}|${JSON.stringify({ ...job, history: build?.ok ? build.info : null })}`
  }

  const [run, setRun] = useState<RunState>({ key: '', progress: null, result: null, resultKey: null, cost: null, costKey: null, error: null, ms: null })
  const worker = useRef<Worker | null>(null)
  const busy = useRef(false)
  const jobId = useRef(0)
  const jobRef = useRef(job)
  jobRef.current = job

  useEffect(() => {
    if (!key) return
    const timer = setTimeout(() => {
      const j = jobRef.current
      if (!j) return
      const id = ++jobId.current
      // A run still going is for an older plan: stop it by starting a fresh worker.
      if (worker.current && busy.current) {
        worker.current.terminate()
        worker.current = null
      }
      try {
        worker.current ??= new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
      } catch (err) {
        setRun((r) => ({ ...r, key, error: `Couldn’t start the background calculator (${err instanceof Error ? err.message : String(err)}).` }))
        return
      }
      busy.current = true
      setRun((r) => ({ ...r, key, progress: { stage: 'main', done: 0, total: j.runs }, error: null }))
      worker.current.onmessage = (e: MessageEvent<WorkerMessage>) => {
        const m = e.data
        if (m.id !== jobId.current) return
        if (m.type === 'progress') setRun((r) => ({ ...r, progress: { stage: m.stage, done: m.done, total: m.total } }))
        else if (m.type === 'result') {
          if (!j.cost) busy.current = false
          setRun((r) => ({ ...r, result: m.result, resultKey: key, ms: m.ms, progress: j.cost ? { stage: 'cost', done: 0, total: 1 } : null, cost: j.cost ? r.cost : null }))
        } else if (m.type === 'cost') {
          busy.current = false
          setRun((r) => ({ ...r, cost: m.cost, costKey: key, progress: null }))
        } else {
          busy.current = false
          setRun((r) => ({ ...r, error: m.message, progress: null }))
        }
      }
      worker.current.onerror = (e) => {
        busy.current = false
        setRun((r) => ({ ...r, error: e.message || 'The background calculation stopped unexpectedly.', progress: null }))
      }
      worker.current.postMessage({ ...j, id } satisfies PredictionJob)
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [key])

  // Stop the worker when the Planner closes.
  useEffect(
    () => () => {
      worker.current?.terminate()
      worker.current = null
    },
    [],
  )

  const base = { settings, problems, history: build?.ok ? build.info : null, historyProblem: build && !build.ok ? build.message : null, ms: run.ms }
  const empty = { progress: null, result: null, cost: null, stale: false, error: null }
  if (!enabled) return { ...base, ...empty, status: 'off' }
  if (problems.length > 0) return { ...base, ...empty, result: run.result, stale: true, status: 'blocked' }
  if (!monthly.data) return { ...base, ...empty, status: monthly.loading ? 'loading' : 'noData' }
  if (build && !build.ok) return { ...base, ...empty, result: run.result, stale: true, status: 'blocked' }
  const fresh = run.resultKey === key
  const costFresh = run.costKey === key
  return {
    ...base,
    status: run.error && run.key === key ? 'error' : fresh && !run.progress ? 'done' : 'running',
    progress: run.key === key ? run.progress : null,
    result: run.result,
    cost: wantCost && costFresh ? run.cost : null,
    stale: !fresh,
    error: run.key === key ? run.error : null,
  }
}

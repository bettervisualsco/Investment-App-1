// The Web Worker that runs Prediction mode's simulations away from the screen,
// so scrolling and typing never freeze. It gets a job (plan + history), sends
// progress now and then, then the result, then (if asked) "Show the cost".
// A newer job replaces an older one: the screen simply starts a fresh worker.

import { preparePrediction, runPrediction, runPredictionCost } from '../engine/prediction'
import type { PredictionJob, WorkerMessage } from './protocol'

const post = (m: WorkerMessage) => (self as unknown as Worker).postMessage(m)

self.onmessage = (e: MessageEvent<PredictionJob>) => {
  const job = e.data
  const started = performance.now()
  try {
    let stage: 'main' | 'cost' = 'main'
    let last = 0
    const prep = preparePrediction(job.plan, job.history, {
      runs: job.runs,
      blockMonths: job.blockMonths,
      seed: job.seed,
      percentiles: job.percentiles,
      onProgress: (done, total) => {
        // At most about 20 updates a second.
        const now = performance.now()
        if (done < total && now - last < 50) return
        last = now
        post({ id: job.id, type: 'progress', stage, done, total })
      },
    })
    const result = runPrediction(prep)
    post({ id: job.id, type: 'result', result, ms: performance.now() - started })
    if (job.cost) {
      stage = 'cost'
      post({ id: job.id, type: 'cost', cost: runPredictionCost(prep, result) })
    }
  } catch (err) {
    post({ id: job.id, type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}

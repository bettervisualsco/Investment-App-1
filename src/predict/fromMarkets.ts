// Markets tab → Planner: "Or replay this period's history in Prediction mode".
// No screen code.

import type { EtfsFile } from '../data'
import type { Plan } from '../engine/types'
import type { HistoryWindowRequest } from '../markets/UseInPlanner'
import { withInvestment } from './etfFacts'
import { withPrediction } from './settingsStore'

/**
 * Puts the highlighted ETF into the chosen phase and switches the plan to
 * Prediction mode, replaying only the highlighted years. Prediction mode's
 * history window is whole calendar years and applies to the whole plan, so
 * the message says exactly that rather than repeating the highlighted days.
 */
export function applyHistoryWindow(plan: Plan, req: HistoryWindowRequest, etfs: EtfsFile | undefined): { plan: Plan; message: string } {
  const phase = plan.phases.find((p) => p.id === req.phaseId)
  if (!phase) return { plan, message: 'That phase is no longer in the plan, so nothing was changed.' }
  const fromYear = Number(req.fromMonth.slice(0, 4))
  const toYear = Number(req.toMonth.slice(0, 4))
  const phases = plan.phases.map((p) => (p.id === req.phaseId ? withInvestment(p, { kind: 'etf', etf: req.etfId }, etfs, plan.currency) : p))
  const next = withPrediction({ ...plan, phases }, { mode: 'prediction', window: 'custom', windowFrom: fromYear, windowTo: toYear })
  const years = fromYear === toYear ? `${fromYear}` : `${fromYear} to ${toYear}`
  return {
    plan: next,
    message: `“${phase.name || 'That phase'}” is now invested in ${req.etfId}, and the plan is in Prediction mode, replaying history from ${years} (whole calendar years, for every phase in the plan).`,
  }
}

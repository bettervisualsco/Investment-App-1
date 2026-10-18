import type { Plan } from '../engine/types'
import type { SavedPlanRecord } from '../state/db'
import { samePlan } from './samePlan'

/**
 * How the plan in the Planner relates to the saved plans:
 *   new:     never saved.
 *   saved:   identical to its saved copy.
 *   changed: saved before, but edited since.
 */
export type SaveStatus = 'new' | 'saved' | 'changed'

export function saveStatus(plan: Plan, saved: SavedPlanRecord[]): SaveStatus {
  const match = saved.find((r) => r.id === plan.id)
  if (!match) return 'new'
  return samePlan(match.plan, plan) ? 'saved' : 'changed'
}

export function displayName(plan: Plan): string {
  return plan.name.trim() || 'Untitled plan'
}

// Numbers for comparing plans side by side. No screen code.

import { runManual, type ManualResult } from '../engine/manual'
import type { Plan } from '../engine/types'
import { validatePlan } from '../engine/validate'

export const MAX_COMPARE = 3

export type PlanOutcome = { ok: true; result: ManualResult } | { ok: false; problems: string[] }

export function runPlan(plan: Plan): PlanOutcome {
  const problems = validatePlan(plan)
  if (problems.length) return { ok: false, problems: problems.map((p) => p.message) }
  return { ok: true, result: runManual(plan) }
}

/** One chart row: a day, and each plan's balance on it (null where that plan hasn't started or has ended). */
export interface CompareRow {
  day: number
  values: (number | null)[]
}

/**
 * Puts several plans' balances on one timeline. Rows are every day any plan
 * has a point for. Each plan's value is its own most recent point on or before
 * that day, so every number shown came straight from the calculation (never
 * blended between points). Points are at most a few weeks apart.
 */
export function mergeSeries(results: (ManualResult | null)[]): CompareRow[] {
  const days = new Set<number>()
  for (const r of results) r?.series.forEach((p) => days.add(p.day))
  const sorted = [...days].sort((a, b) => a - b)
  const cursor = results.map(() => 0)

  return sorted.map((day) => ({
    day,
    values: results.map((r, i) => {
      if (!r) return null
      const s = r.series
      if (day < s[0].day || day > s[s.length - 1].day) return null
      while (cursor[i] + 1 < s.length && s[cursor[i] + 1].day <= day) cursor[i]++
      return s[cursor[i]].balance
    }),
  }))
}

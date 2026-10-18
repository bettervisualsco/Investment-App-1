// The example plan shown the first time the app opens.

import { parseISO, toISO } from '../engine/dates'
import type { Phase, Plan } from '../engine/types'
import { newId } from '../lib/id'
import { todayISO } from '../lib/format'

export function blankPhase(name = 'New phase'): Phase {
  return {
    id: newId(),
    name,
    duration: { count: 5, unit: 'years' },
    depositFrequency: 'monthly',
    deposit: { kind: 'fixed', value: 20_000 },
    returnRate: { kind: 'fixed', value: 7 },
  }
}

export function examplePlan(): Plan {
  const start = todayISO()
  const { y, m } = parseISO(start)
  return {
    id: newId(),
    name: 'My plan',
    startDate: start,
    startingBalance: 100_000,
    currency: 'AUD',
    phases: [
      { ...blankPhase('School years'), duration: { count: 2, unit: 'years' }, depositFrequency: 'weekly', deposit: { kind: 'fixed', value: 2_000 } },
      { ...blankPhase('Uni days'), duration: { count: 4, unit: 'years' }, depositFrequency: 'weekly', deposit: { kind: 'fixed', value: 5_000 } },
      {
        ...blankPhase('First job'),
        duration: { count: 10, unit: 'years' },
        depositFrequency: 'monthly',
        deposit: { kind: 'ramp', from: 50_000, to: 150_000, shape: 'linear' },
      },
    ],
    events: [
      { id: newId(), name: 'Birthday money', date: toISO({ y: y + 1, m, d: 1 }), amount: 50_000 },
      { id: newId(), name: 'First car', date: toISO({ y: y + 7, m, d: 1 }), amount: -1_500_000 },
    ],
    goal: { amount: 15_000_000, date: toISO({ y: y + 16, m, d: 1 }) },
  }
}

/** A fresh, nearly empty plan for "New plan" in the Saved tab. */
export function blankPlan(): Plan {
  return {
    id: newId(),
    name: 'New plan',
    startDate: todayISO(),
    startingBalance: 0,
    currency: 'AUD',
    phases: [blankPhase('First phase')],
    events: [],
  }
}

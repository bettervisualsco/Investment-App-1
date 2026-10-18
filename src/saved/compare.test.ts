import { describe, expect, it } from 'vitest'
import { toDayNumber } from '../engine/dates'
import { runManual, type ManualResult } from '../engine/manual'
import type { Plan } from '../engine/types'
import { mergeSeries, runPlan } from './compare'

function plan(start: string, years: number, rate: number): Plan {
  return {
    id: start,
    name: start,
    startDate: start,
    startingBalance: 1_000_000,
    currency: 'AUD',
    phases: [{ id: 'p', name: 'p', duration: { count: years, unit: 'years' }, depositFrequency: 'none', deposit: { kind: 'fixed', value: 0 }, returnRate: { kind: 'fixed', value: rate } }],
    events: [],
  }
}

describe('comparing plans', () => {
  it('runs valid plans and explains invalid ones', () => {
    expect(runPlan(plan('2026-01-01', 2, 5)).ok).toBe(true)
    const bad = runPlan({ ...plan('2026-01-01', 2, 5), phases: [] })
    expect(bad).toEqual({ ok: false, problems: ['Add at least one phase.'] })
  })

  it('gives each plan its own exact values on a shared timeline', () => {
    const a = runManual(plan('2026-01-01', 10, 7))
    const b = runManual(plan('2030-07-01', 5, 3))
    const rows = mergeSeries([a, null, b])

    // Every point of each plan appears with its exact balance.
    for (const [i, r] of [
      [0, a],
      [2, b],
    ] as [number, ManualResult][]) {
      for (const p of r.series) {
        const row = rows.find((x) => x.day === p.day)!
        expect(row.values[i]).toBe(p.balance)
      }
    }
    // A plan with no result (it has problems) never has values.
    expect(rows.every((r) => r.values[1] === null)).toBe(true)
    // Before plan B starts and after it ends, it has no value.
    expect(rows.find((r) => r.day === toDayNumber('2026-01-01'))!.values[2]).toBeNull()
    expect(rows[rows.length - 1].values[2]).toBeNull()
    // Rows are in date order with no repeats.
    expect(rows.every((r, i) => i === 0 || r.day > rows[i - 1].day)).toBe(true)
  })

  it('10 years at 7% from $10,000 ends at $19,671.51 (checked against the compound interest formula)', () => {
    const a = runManual(plan('2026-01-01', 10, 7))
    const rows = mergeSeries([a])
    expect(Math.round(rows[rows.length - 1].values[0]!)).toBe(Math.round(1_000_000 * 1.07 ** 10))
  })
})

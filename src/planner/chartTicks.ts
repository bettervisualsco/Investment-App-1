// Axis ticks shared by the Planner's charts.

import { toDayNumber } from '../engine/dates'
import { yearOf } from '../lib/format'

/** Day numbers of 1 January in round years between start and end (about 6 of them). */
export function yearTicks(start: number, end: number): number[] {
  const first = yearOf(start) + 1
  const last = yearOf(end)
  const span = Math.max(1, last - first)
  const step = [1, 2, 5, 10, 20, 25, 50].find((s) => span / s <= 6) ?? 50
  const ticks: number[] = []
  for (let y = Math.ceil(first / step) * step; y <= last; y += step) {
    const day = toDayNumber({ y, m: 1, d: 1 })
    if (day > start && day < end) ticks.push(day)
  }
  return ticks
}

/** Round-number money ticks ($0, $50K, $100K…) covering 0 to max. */
export function moneyTicks(max: number): number[] {
  if (max <= 0) return [0, 10_000]
  const rough = max / 4
  const mag = Math.pow(10, Math.floor(Math.log10(rough)))
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * mag >= rough) ?? 10) * mag
  const ticks: number[] = []
  for (let t = 0; t < max + step; t += step) ticks.push(t)
  return ticks
}

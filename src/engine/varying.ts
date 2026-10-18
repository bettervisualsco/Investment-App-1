// Working out the value of a deposit or return rate that changes during a phase.

import { addDuration } from './schedule'
import type { CurveShape, Varying } from './types'

/** Bends a 0→1 progress value into the chosen curve shape. */
export function applyCurve(p: number, shape: CurveShape): number {
  const t = Math.min(1, Math.max(0, p))
  switch (shape) {
    case 'linear':
      return t
    case 'slowThenFast':
      return t * t
    case 'fastThenSlow':
      return 1 - (1 - t) * (1 - t)
  }
}

export interface Window {
  start: number // first day of the change window
  end: number // first day after it (exclusive)
}

/** The part of the phase over which the value changes. */
export function changeWindow(v: Varying, phaseStart: number, phaseEnd: number): Window {
  if (v.kind === 'fixed') return { start: phaseStart, end: phaseEnd }
  const start = v.startAfter ? addDuration(phaseStart, v.startAfter) : phaseStart
  const end = v.lasts ? addDuration(start, v.lasts) : phaseEnd
  return { start, end: Math.max(start, end) }
}

/** Days on which a "steps" value jumps (inside its window only). */
function jumpDays(v: Extract<Varying, { kind: 'steps' }>, win: Window): number[] {
  const jumps: number[] = []
  for (let k = 1; ; k++) {
    const day = addDuration(win.start, v.every, k)
    if (day >= win.end) break
    jumps.push(day)
  }
  return jumps
}

/** How many jump days are on or before `day` (binary search). */
function countUpTo(sortedDays: number[], day: number): number {
  let lo = 0
  let hi = sortedDays.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (sortedDays[mid] <= day) lo = mid + 1
    else hi = mid
  }
  return lo
}

/**
 * Returns a fast function giving the value on any day, where a ramp moves
 * smoothly with time: `from` on the window's first day, reaching `to` on the
 * window's last day. Used for return rates.
 */
export function valueByDay(v: Varying, phaseStart: number, phaseEnd: number): (day: number) => number {
  if (v.kind === 'fixed') return () => v.value
  const win = changeWindow(v, phaseStart, phaseEnd)
  if (v.kind === 'steps') {
    const jumps = jumpDays(v, win)
    return (day) => v.from + v.stepBy * countUpTo(jumps, day)
  }
  const lastDay = win.end - 1
  return (day) => {
    if (day <= win.start) return v.from
    if (day >= lastDay) return v.to
    const p = (day - win.start) / (lastDay - win.start)
    return v.from + (v.to - v.from) * applyCurve(p, v.shape)
  }
}

/**
 * Amount of each deposit, given every deposit day in the phase. For a ramp,
 * the first deposit in the window is exactly `from` and the last is exactly
 * `to`, spread by deposit count so the ends are always the round numbers you
 * typed. Amounts are rounded to whole cents and never go below zero.
 */
export function depositAmounts(v: Varying, phaseStart: number, phaseEnd: number, days: number[]): number[] {
  const clean = (value: number) => Math.max(0, Math.round(value))
  if (v.kind === 'fixed') return days.map(() => clean(v.value))
  const win = changeWindow(v, phaseStart, phaseEnd)
  if (v.kind === 'steps') {
    const jumps = jumpDays(v, win)
    return days.map((d) => clean(v.from + v.stepBy * countUpTo(jumps, d)))
  }
  const count = days.filter((d) => d >= win.start && d < win.end).length
  let indexInWindow = 0
  return days.map((d) => {
    if (d < win.start) return clean(v.from)
    if (d >= win.end) return clean(v.to)
    const p = count === 1 ? 1 : indexInWindow / (count - 1)
    indexInWindow++
    return clean(v.from + (v.to - v.from) * applyCurve(p, v.shape))
  })
}

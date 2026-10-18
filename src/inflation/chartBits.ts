// Small helpers shared by the Inflation tab's charts.

import type { Country } from './cpi'

export const Y_AXIS_WIDTH = 44
export const RIGHT_GAP = 14
export const TOP_GAP = 12

/** Line colour for each country (checked for colour-blind separation in light and dark mode, see inflation.css). */
export const COUNTRY_COLOR: Record<Country, string> = { au: 'var(--series-au)', us: 'var(--series-us)' }

/** Round-number % ticks covering min…max (always including 0). */
export function pctTicks(min: number, max: number): number[] {
  const lo = Math.min(0, min)
  const hi = Math.max(0, max)
  const rough = (hi - lo) / 5 || 1
  const mag = Math.pow(10, Math.floor(Math.log10(rough)))
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * mag >= rough) ?? 10) * mag
  const ticks: number[] = []
  for (let t = Math.floor(lo / step) * step; t < hi + step; t += step) ticks.push(Math.round(t * 1000) / 1000)
  return ticks
}

/** Year ticks (as month numbers, at January) between two month numbers, about 6 of them. */
export function yearTicks(from: number, to: number): number[] {
  const first = Math.floor(from / 12) + (from % 12 === 0 ? 0 : 1)
  const last = Math.floor(to / 12)
  const span = Math.max(1, last - first)
  const step = [1, 2, 5, 10, 20, 25, 50].find((s) => span / s <= 6) ?? 50
  const ticks: number[] = []
  for (let y = Math.ceil(first / step) * step; y <= last; y += step) ticks.push(y * 12)
  return ticks
}

/** "2.66%" */
export function pct(fraction: number, digits = 1): string {
  if (!Number.isFinite(fraction)) return '—'
  const v = fraction * 100
  return `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits)}%`
}

/** "33½ years", "9 months" */
export function spanWords(months: number): string {
  if (months < 12) return `${months} month${months === 1 ? '' : 's'}`
  const years = months / 12
  const whole = Math.floor(years)
  const rest = months % 12
  if (rest === 0) return `${whole} year${whole === 1 ? '' : 's'}`
  if (rest === 6) return `${whole}½ years`
  return `${whole} years ${rest} month${rest === 1 ? '' : 's'}`
}

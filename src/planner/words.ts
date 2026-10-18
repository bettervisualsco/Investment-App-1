// Plain-English descriptions of plan settings.

import type { Currency, Duration, DurationUnit, Frequency, Investment, Phase, Varying } from '../engine/types'
import { moneyExact, percent } from '../lib/format'

const unitWords: Record<DurationUnit, [string, string]> = {
  days: ['day', 'days'],
  weeks: ['week', 'weeks'],
  fortnights: ['fortnight', 'fortnights'],
  months: ['month', 'months'],
  years: ['year', 'years'],
  decades: ['decade', 'decades'],
}

export function durationText(d: Duration): string {
  const [one, many] = unitWords[d.unit]
  return `${d.count} ${d.count === 1 ? one : many}`
}

export const durationUnitOptions = (count: number) =>
  (Object.keys(unitWords) as DurationUnit[]).map((u) => ({ value: u, label: count === 1 ? unitWords[u][0] : unitWords[u][1] }))

export const frequencyOptions: { value: Frequency; label: string }[] = [
  { value: 'daily', label: 'Every day' },
  { value: 'weekly', label: 'Every week' },
  { value: 'fortnightly', label: 'Every fortnight' },
  { value: 'monthly', label: 'Every month' },
  { value: 'quarterly', label: 'Every quarter' },
  { value: 'yearly', label: 'Every year' },
  { value: 'none', label: 'No regular deposits' },
]

const per: Record<Frequency, string> = {
  none: '',
  daily: 'a day',
  weekly: 'a week',
  fortnightly: 'a fortnight',
  monthly: 'a month',
  quarterly: 'a quarter',
  yearly: 'a year',
}

function depositText(v: Varying, f: Frequency, currency: Currency): string {
  if (f === 'none') return 'No regular deposits'
  const m = (c: number) => moneyExact(c, currency)
  if (v.kind === 'fixed') return `${m(v.value)} ${per[f]}`
  if (v.kind === 'ramp') return `${m(v.from)} rising to ${m(v.to)} ${per[f]}`
  const sign = v.stepBy < 0 ? '−' : '+'
  return `${m(v.from)} ${per[f]}, ${sign}${m(Math.abs(v.stepBy))} every ${durationText(v.every)}`
}

function rateText(v: Varying): string {
  if (v.kind === 'fixed') return `${percent(v.value)} a year`
  if (v.kind === 'ramp') return `${percent(v.from)} moving to ${percent(v.to)} a year`
  return `${percent(v.from)} a year, ${v.stepBy < 0 ? '−' : '+'}${percent(Math.abs(v.stepBy))} every ${durationText(v.every)}`
}

/** "VAS", "70% VGS / 30% VAS", "a savings account", "a custom asset (7%, volatility 15%)" */
export function investmentText(inv: Investment): string {
  if (inv.kind === 'etf') return inv.etf
  if (inv.kind === 'mix') return inv.parts.map((p) => `${percent(p.weight)} ${p.etf}`).join(' / ')
  if (inv.kind === 'cash') return 'a savings account'
  return `a custom asset (${percent(inv.mean)} a year, volatility ${percent(inv.volatility)})`
}

/**
 * Manual mode: "$50 a week for 4 years, growing 7% a year" (a savings account: "earning 4% a year in a savings account").
 * Prediction mode: "$50 a week for 4 years, in VAS".
 */
export function phaseSentence(phase: Phase, currency: Currency, mode: 'manual' | 'prediction' = 'manual'): string {
  const start = `${depositText(phase.deposit, phase.depositFrequency, currency)} for ${durationText(phase.duration)}`
  const inv = phase.investment
  if (mode === 'prediction') return `${start}, ${inv ? `in ${investmentText(inv)}` : 'investment not chosen yet'}`
  if (inv?.kind === 'cash') return `${start}, earning ${percent(inv.rate)} a year in a savings account`
  return `${start}, growing ${rateText(phase.returnRate)}${inv ? ` (${investmentText(inv)})` : ''}`
}

/** "10th", "50th", "1st", "92.5th" */
export function percentileName(p: number): string {
  const n = Math.round(p * 10) / 10
  if (!Number.isInteger(n)) return `${n}th`
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'
  return `${n}${suffix}`
}

/** ["Worst (10th)", "Likely (median)", "Best (90th)"] */
export function percentileLabels([lo, mid, hi]: readonly [number, number, number]): [string, string, string] {
  return [`Worst (${percentileName(lo)})`, mid === 50 ? 'Likely (median)' : `Likely (${percentileName(mid)})`, `Best (${percentileName(hi)})`]
}

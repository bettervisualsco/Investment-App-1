// Plain-English descriptions of plan settings.

import type { Currency, Duration, DurationUnit, Frequency, Phase, Varying } from '../engine/types'
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

/** "$50 a week for 4 years, growing 7% a year" */
export function phaseSentence(phase: Phase, currency: Currency): string {
  return `${depositText(phase.deposit, phase.depositFrequency, currency)} for ${durationText(phase.duration)}, growing ${rateText(phase.returnRate)}`
}

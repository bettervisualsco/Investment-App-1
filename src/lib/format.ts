// Turning engine numbers (cents, day numbers) into text for the screen, and back.

import { fromDayNumber, toDayNumber } from '../engine/dates'
import type { Currency } from '../engine/types'

const symbol = (currency: Currency) => (currency === 'AUD' ? '$' : 'US$')

const whole = new Intl.NumberFormat('en-AU', { maximumFractionDigits: 0 })
const twoDp = new Intl.NumberFormat('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const compact = new Intl.NumberFormat('en-AU', { notation: 'compact', maximumFractionDigits: 1 })

/** $12,345 (rounded to whole dollars). */
export function money(cents: number, currency: Currency = 'AUD'): string {
  const dollars = Math.round(cents / 100)
  const sign = dollars < 0 ? '−' : ''
  return `${sign}${symbol(currency)}${whole.format(Math.abs(dollars))}`
}

/** $12.50, or $12 when there are no cents. */
export function moneyExact(cents: number, currency: Currency = 'AUD'): string {
  const c = Math.round(cents)
  const sign = c < 0 ? '−' : ''
  const abs = Math.abs(c)
  const text = abs % 100 === 0 ? whole.format(abs / 100) : twoDp.format(abs / 100)
  return `${sign}${symbol(currency)}${text}`
}

/** $412K, $1.2M: for chart axes. */
export function moneyCompact(cents: number, currency: Currency = 'AUD'): string {
  const sign = cents < 0 ? '−' : ''
  return `${sign}${symbol(currency)}${compact.format(Math.abs(cents) / 100)}`
}

/** Reads what someone typed ("1,200.5", "$80") as cents. Returns null if it isn't a number. */
export function parseMoney(text: string): number | null {
  const cleaned = text.replace(/[$,\s]|US/g, '')
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100)
}

/** Text to show inside a money input for a cents value. */
export function moneyInputText(cents: number): string {
  const abs = Math.abs(cents)
  const text = abs % 100 === 0 ? whole.format(abs / 100) : twoDp.format(abs / 100)
  return cents < 0 ? `-${text}` : text
}

const dateFmt = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const monthYearFmt = new Intl.DateTimeFormat('en-AU', { month: 'short', year: 'numeric', timeZone: 'UTC' })

function dayToDate(day: number): Date {
  const { y, m, d } = fromDayNumber(day)
  return new Date(Date.UTC(y, m - 1, d))
}

/** 18 Oct 2026 */
export function dateLong(day: number): string {
  return dateFmt.format(dayToDate(day))
}

/** Oct 2026 */
export function dateMonthYear(day: number): string {
  return monthYearFmt.format(dayToDate(day))
}

export function yearOf(day: number): number {
  return fromDayNumber(day).y
}

/** Today's date on this device, as YYYY-MM-DD. */
export function todayISO(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function todayDay(): number {
  return toDayNumber(todayISO())
}

export function percent(value: number): string {
  const rounded = Math.round(value * 100) / 100
  return `${rounded}%`
}

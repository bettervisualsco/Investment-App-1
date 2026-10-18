// Turning the compact data files into easy-to-use arrays. Pure functions, no screen code.

import type { AssetSeriesKey, DailyFile, MonthlyFile } from './types'

const DAY_MS = 86_400_000

/** Day number (days since 1970-01-01) from "YYYY-MM-DD". */
export function dayNumber(iso: string): number {
  return Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY_MS)
}

export function isoFromDayNumber(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10)
}

export interface DailyRows {
  /** "YYYY-MM-DD" for each trading day. */
  dates: string[]
  close: number[]
  /** Adjusted close (includes distributions). Same as close for indexes. */
  adj: number[]
}

/** Rebuilds the list of dates from a daily file (first date + gaps in days). */
export function decodeDaily(f: DailyFile): DailyRows {
  const dates: string[] = []
  let day = dayNumber(f.first)
  f.d.forEach((gap, i) => {
    if (i > 0) day += gap
    dates.push(isoFromDayNumber(day))
  })
  return { dates, close: f.c, adj: f.a ?? f.c }
}

// ---- months ----------------------------------------------------------------------------

/** Months since year 0, so months can be subtracted: "2026-10" -> 24321. */
export function monthNumber(ym: string): number {
  const [y, m] = ym.split('-').map(Number)
  return y * 12 + (m - 1)
}

export function monthFromNumber(n: number): string {
  return `${String(Math.floor(n / 12)).padStart(4, '0')}-${String((n % 12) + 1).padStart(2, '0')}`
}

/** One month's change (0.01234 = +1.234%) from a monthly series, or null if there is no data. */
export function monthValue(file: MonthlyFile, series: { start: string; values: (number | null)[] }, ym: string): number | null {
  const i = monthNumber(ym) - monthNumber(series.start)
  const v = i >= 0 && i < series.values.length ? series.values[i] : null
  return v === null ? null : v / file.scale
}

export interface AlignedMonths {
  months: string[]
  /** columns[key][i] is the change in months[i] (as a fraction). */
  columns: Record<string, number[]>
}

/**
 * The months (between `from` and `to`, inclusive) where every requested series has data, with each
 * series' value for that same real month. This is what Prediction mode samples from, so a sampled
 * month always carries that month's returns, inflation and exchange-rate move together.
 * Keys are asset series names (e.g. "au_shares", "audusd") or "etf:VAS" for an ETF's spliced series.
 */
export function alignedMonths(file: MonthlyFile, keys: string[], from?: string, to?: string): AlignedMonths {
  const lookup = keys.map((k) => (k.startsWith('etf:') ? file.etfs[k.slice(4)] : file.series[k as AssetSeriesKey]))
  lookup.forEach((s, i) => {
    if (!s) throw new Error(`No monthly series called "${keys[i]}"`)
  })
  const start = Math.max(...lookup.map((s) => monthNumber(s.start)), from ? monthNumber(from) : -Infinity)
  const end = Math.min(...lookup.map((s) => monthNumber(s.start) + s.values.length - 1), to ? monthNumber(to) : Infinity)
  const months: string[] = []
  const columns: Record<string, number[]> = Object.fromEntries(keys.map((k) => [k, []]))
  for (let n = start; n <= end; n++) {
    const vals = lookup.map((s) => s.values[n - monthNumber(s.start)])
    if (vals.some((v) => v === null || v === undefined)) continue
    months.push(monthFromNumber(n))
    vals.forEach((v, i) => columns[keys[i]].push((v as number) / file.scale))
  }
  return { months, columns }
}

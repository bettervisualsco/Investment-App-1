// Glue between the market data (src/data) and the prediction engine: turns
// monthly.json into the history table the engine replays, for one plan.
//
//   - Only the series the plan needs: each ETF it uses (single or in a mix),
//     the cash rate if a phase is a savings account, inflation, and AUD/USD
//     if any ETF trades in a different currency from the plan.
//   - Only months where ALL of them have data, so every sampled month carries
//     its own real returns, inflation and exchange-rate move together.
//   - ETF months in monthly.json are after the fund's fee. The engine takes
//     the management fee off itself (Fees switch), so the fee is added back
//     here: gross = (1 + r) / (1 − fee/12) − 1. Otherwise it would be counted twice.
//   - US-listed ETFs are turned into A$ with the same month's AUD/USD move:
//     (1 + r in US$) / (1 + change in US$ per A$1) − 1. (And A$ ETFs into US$ for a US$ plan.)

import { alignedMonths, monthFromNumber, monthNumber, type MonthlyFile } from '../data'
import { CASH_KEY, etfKey, etfsUsed, usesCash } from '../engine/assets'
import type { HistoryTable } from '../engine/prediction'
import type { Currency, HistoryWindowKind, Plan } from '../engine/types'

export interface HistoryChoice {
  window: HistoryWindowKind
  /** For "custom": first and last calendar year. */
  from?: number
  to?: number
}

export interface HistoryInfo {
  first: string
  last: string
  months: number
  /** The window had to be cut to where every series has data. */
  clipped: boolean
  /** Plain-English description of the history used, and why it starts and ends where it does. */
  note: string
}

export type HistoryBuild = { ok: true; table: HistoryTable; info: HistoryInfo } | { ok: false; message: string }

export const MIN_HISTORY_MONTHS = 24

/** Change in a month for a currency, as a fraction (gross of fees). */
/** The RBA cash rate stored as yearly rate ÷ 12 → the monthly return that compounds to that yearly rate. */
export function auCashMonthly(rateOver12: number): number {
  return Math.pow(1 + 12 * rateOver12, 1 / 12) - 1
}

export function grossOfFee(r: number, yearlyFee: number): number {
  return (1 + r) / (1 - yearlyFee / 12) - 1
}

/** A US$ return in A$ terms, given the same month's change in US$ per A$1. */
export function usdToAud(r: number, audusdChange: number): number {
  return (1 + r) / (1 + audusdChange) - 1
}

/** An A$ return in US$ terms. */
export function audToUsd(r: number, audusdChange: number): number {
  return (1 + r) * (1 + audusdChange) - 1
}

function listWords(words: string[]): string {
  return words.length <= 1 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
}

export const monthText = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${y}`
}

/** The data series a plan needs, as alignedMonths() keys, with a name for each. */
export function seriesNeeded(file: MonthlyFile, plan: Plan): { keys: string[]; names: Record<string, string>; missing: string[] } {
  const home: Currency = plan.currency
  const keys: string[] = []
  const names: Record<string, string> = {}
  const missing: string[] = []
  let fx = false
  for (const id of etfsUsed(plan)) {
    const etf = file.etfs[id]
    if (!etf) {
      missing.push(id)
      continue
    }
    keys.push(etfKey(id))
    const proxies = [...new Set(etf.proxy.map((p) => file.series[p.series as keyof MonthlyFile['series']]?.label.replace(/ \(.*\)$/, '')).filter(Boolean))]
    names[etfKey(id)] = proxies.length ? `${id} (with ${listWords(proxies)} history before ${id} began)` : id
    if (etf.currency !== home) fx = true
  }
  const cash = home === 'AUD' ? 'cash_au' : 'cash_us'
  if (usesCash(plan)) keys.push(cash)
  const cpi = home === 'AUD' ? 'au_cpi' : 'us_cpi'
  keys.push(cpi)
  if (fx) keys.push('audusd')
  for (const k of [cash, cpi, 'audusd']) if (file.series[k as keyof MonthlyFile['series']]) names[k] = file.series[k as keyof MonthlyFile['series']].label
  return { keys, names, missing }
}

/** First and last month with data for one series key. */
function rangeOf(file: MonthlyFile, key: string): { first: number; last: number } {
  const s = key.startsWith('etf:') ? file.etfs[key.slice(4)] : file.series[key as keyof MonthlyFile['series']]
  let first = 0
  while (first < s.values.length && s.values[first] === null) first++
  let last = s.values.length - 1
  while (last >= 0 && s.values[last] === null) last--
  const start = monthNumber(s.start)
  return { first: start + first, last: start + last }
}

export function buildHistory(file: MonthlyFile, plan: Plan, choice: HistoryChoice): HistoryBuild {
  const { keys, names, missing } = seriesNeeded(file, plan)
  if (missing.length) return { ok: false, message: `There’s no history for ${missing.join(', ')} in the market data yet.` }

  // Where every needed series has data.
  const ranges = keys.map((k) => ({ key: k, ...rangeOf(file, k) }))
  const availFirst = Math.max(...ranges.map((r) => r.first))
  const availLast = Math.min(...ranges.map((r) => r.last))
  const startsLatest = ranges.find((r) => r.first === availFirst)!
  const endsSoonest = ranges.find((r) => r.last === availLast)!

  let wantFirst: number | null = null
  let wantLast: number | null = null
  let wanted = 'Full history'
  if (choice.window === 'since1950') [wantFirst, wanted] = [monthNumber('1950-01'), 'History since 1950']
  if (choice.window === 'since1990') [wantFirst, wanted] = [monthNumber('1990-01'), 'History since 1990']
  if (choice.window === 'last20') [wantFirst, wanted] = [availLast - 239, 'The last 20 years']
  if (choice.window === 'custom') {
    const from = choice.from ?? 1900
    const to = choice.to ?? 2100
    wantFirst = monthNumber(`${String(from).padStart(4, '0')}-01`)
    wantLast = monthNumber(`${String(to).padStart(4, '0')}-12`)
    wanted = `History from ${from} to ${to}`
  }
  const first = Math.max(availFirst, wantFirst ?? -Infinity)
  const last = Math.min(availLast, wantLast ?? Infinity)
  if (last - first + 1 < MIN_HISTORY_MONTHS) {
    return {
      ok: false,
      message: `The history for this plan runs from ${monthText(monthFromNumber(availFirst))} to ${monthText(monthFromNumber(availLast))}. Pick a window inside that, at least 2 years long.`,
    }
  }

  const aligned = alignedMonths(file, keys, monthFromNumber(first), monthFromNumber(last))
  const n = aligned.months.length
  if (n < MIN_HISTORY_MONTHS) return { ok: false, message: 'There aren’t enough months of history with every series. Pick a longer window.' }

  // Asset columns, gross of fees and in the plan's currency.
  const home = plan.currency
  const fx = aligned.columns.audusd
  const assets: Record<string, Float64Array> = {}
  for (const id of etfsUsed(plan)) {
    const etf = file.etfs[id]
    const raw = aligned.columns[etfKey(id)]
    const fee = etf.fee ?? 0
    const col = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      let r = grossOfFee(raw[i], fee)
      if (etf.currency === 'USD' && home === 'AUD') r = usdToAud(r, fx[i])
      if (etf.currency === 'AUD' && home === 'USD') r = audToUsd(r, fx[i])
      col[i] = r
    }
    assets[etfKey(id)] = col
  }
  if (usesCash(plan)) {
    // cash_au is the RBA's yearly rate ÷ 12. Turn it into the monthly return that compounds to exactly that yearly
    // rate, the same convention as a savings rate typed in Manual mode. cash_us is already real monthly T-bill returns.
    assets[CASH_KEY] =
      home === 'AUD' ? Float64Array.from(aligned.columns.cash_au, (m) => auCashMonthly(m)) : Float64Array.from(aligned.columns.cash_us)
  }
  const inflation = Float64Array.from(aligned.columns[home === 'AUD' ? 'au_cpi' : 'us_cpi'])

  // Words: what was used, and why it starts (and ends) where it does.
  const firstYm = aligned.months[0]
  const lastYm = aligned.months[n - 1]
  const span = `${monthText(firstYm)} to ${monthText(lastYm)} (${n.toLocaleString('en-AU')} months)`
  const clippedStart = wantFirst === null ? false : wantFirst < availFirst
  const clippedEnd = wantLast !== null && wantLast > availLast
  let note = `${wanted}: ${span}.`
  if (wantFirst === null || clippedStart) {
    note += ` It starts in ${monthText(firstYm)} because that’s as far back as the data for ${names[startsLatest.key] ?? startsLatest.key} goes.`
  }
  if (clippedEnd) note += ` It ends in ${monthText(lastYm)}, the latest month of ${names[endsSoonest.key] ?? endsSoonest.key}.`
  const skipped = last - first + 1 - n
  if (skipped > 0) note += ` ${skipped} month${skipped === 1 ? '' : 's'} with a gap in the data ${skipped === 1 ? 'was' : 'were'} left out.`

  return {
    ok: true,
    table: { months: aligned.months, assets, inflation },
    info: { first: firstYm, last: lastYm, months: n, clipped: clippedStart || clippedEnd, note },
  }
}

// Each ETF's returns after inflation, for the Inflation tab. Pure functions.
// Returns come from data/monthly.json (total return, fee taken off; proxy index history before the
// ETF existed), and inflation from the same calendar months of the CPI.

import { monthNumber } from '../data/decode'
import type { MonthlyFile } from '../data/types'
import { chainEnd, monthLabel, realReturn, toAudReturn, type Country, type MonthlyChain, type RealReturn } from './cpi'

export type Period = '1' | '3' | '5' | '10' | '20' | 'own' | 'all'

export interface EtfRealRow {
  id: string
  label: string
  currency: 'AUD' | 'USD'
  /** Whose inflation (and currency) the row uses. */
  view: Country
  from: string
  to: string
  result: RealReturn | null
  /** True when some months are index history from before the ETF started. */
  usesProxy: boolean
  /** Why there's no result, if there isn't one. */
  missing?: string
}

/** The last month of a monthly series that has a value. */
function lastMonth(start: string, values: (number | null)[]): number {
  for (let i = values.length - 1; i >= 0; i--) if (values[i] !== null) return monthNumber(start) + i
  return -Infinity
}

/**
 * Real returns for every ETF over a period ending at the same month for all of them (the latest
 * month every needed series has). US-listed ETFs are shown in A$ after Australian inflation
 * (`usInAud`), or in US$ after US inflation.
 */
export function etfRealReturns(file: MonthlyFile, chains: Record<Country, MonthlyChain>, period: Period, usInAud: boolean): EtfRealRow[] {
  const fx = file.series.audusd
  const etfs = Object.entries(file.etfs)
  const view = (cur: 'AUD' | 'USD'): Country => (cur === 'USD' && !usInAud ? 'us' : 'au')
  // a common end month for a fair comparison
  let end = Infinity
  for (const [, e] of etfs) {
    end = Math.min(end, lastMonth(e.start, e.values), chainEnd(chains[view(e.currency)]))
    if (e.currency === 'USD' && usInAud) end = Math.min(end, lastMonth(fx.start, fx.values))
  }

  return etfs.map(([id, e]) => {
    const country = view(e.currency)
    const chain = chains[country]
    const convert = e.currency === 'USD' && usInAud
    let start: number
    const earliest = Math.max(monthNumber(e.start), chain.start, convert ? monthNumber(fx.start) : -Infinity)
    if (period === 'own') start = e.realFrom ? monthNumber(e.realFrom) : earliest
    else if (period === 'all') start = earliest
    else start = end - Number(period) * 12 + 1
    const row: EtfRealRow = { id, label: e.label, currency: e.currency, view: country, from: monthLabel(start), to: monthLabel(end), result: null, usesProxy: !e.realFrom || start < monthNumber(e.realFrom) }
    if (start < earliest) return { ...row, missing: `History starts ${monthLabel(earliest)}` }
    const returns: number[] = []
    const inflation: number[] = []
    for (let m = start; m <= end; m++) {
      const v = e.values[m - monthNumber(e.start)]
      const f = convert ? fx.values[m - monthNumber(fx.start)] : 0
      if (v === null || v === undefined || f === null || f === undefined) return { ...row, missing: `No data for ${monthLabel(m)}` }
      const r = v / file.scale
      returns.push(convert ? toAudReturn(r, (f as number) / file.scale) : r)
      inflation.push(chain.changes[m - chain.start])
    }
    return { ...row, result: realReturn(returns, inflation) }
  })
}

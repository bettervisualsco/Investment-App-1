// Year-by-year results as a CSV spreadsheet, including the fee, tax and
// today's-dollars columns for whichever switches are on.

import { dayToISO } from '../engine/dates'
import { financialYearLabel, type ManualResult } from '../engine/manual'

const dollars = (cents: number) => (Math.round(cents) / 100).toFixed(2)

function cell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export function yearTableCsv(result: ManualResult, planName: string): string {
  const sw = result.switches
  const header = ['Financial year', 'From', 'To', 'Opening balance', 'Put in', 'Taken out', 'Growth']
  if (sw.fees) header.push('Fees')
  if (sw.tax) header.push('Tax (negative = refund)', 'Distributions paid to you')
  header.push('Closing balance')
  if (sw.inflation) header.push('Price level (start = 1)', 'Opening (today’s $)', 'Put in (today’s $)', 'Taken out (today’s $)', 'Growth after inflation (today’s $)')
  if (sw.inflation && sw.fees) header.push('Fees (today’s $)')
  if (sw.inflation && sw.tax) header.push('Tax (today’s $)', 'Paid to you (today’s $)')
  if (sw.inflation) header.push('Closing (today’s $)')

  const rows = result.years.map((y) => {
    const row = [financialYearLabel(y.fy), dayToISO(y.firstDay), dayToISO(y.lastDay), dollars(y.opening), dollars(y.deposits), dollars(y.withdrawals), dollars(y.growth)]
    if (sw.fees) row.push(dollars(y.fees))
    if (sw.tax) row.push(dollars(y.tax), dollars(y.paidOut))
    row.push(dollars(y.closing))
    if (sw.inflation) row.push(y.cpiClosing.toFixed(6), dollars(y.real.opening), dollars(y.real.deposits), dollars(y.real.withdrawals), dollars(y.real.growth))
    if (sw.inflation && sw.fees) row.push(dollars(y.real.fees))
    if (sw.inflation && sw.tax) row.push(dollars(y.real.tax), dollars(y.real.paidOut))
    if (sw.inflation) row.push(dollars(y.real.closing))
    return row
  })

  const notes = [['Manual mode, using the return rates entered. An estimate, not a guarantee.']]
  const on = [sw.fees && 'Fees', sw.tax && 'Tax', sw.inflation && 'Inflation'].filter(Boolean)
  notes.push([on.length ? `Switches on: ${on.join(', ')}.` : 'Fees, tax and inflation switches all off.'])
  if (sw.tax) notes.push(['Tax is a simplified estimate per Australian financial year, not tax advice.'])
  if (sw.tax && result.endSale) {
    const s = result.endSale
    notes.push([
      s.mode === 'sell'
        ? `Everything sold on the last day: selling costs ${dollars(s.costs)}, tax ${dollars(s.tax)} (included above).`
        : `Not sold. Selling everything on the last day would add about ${dollars(s.tax)} tax and ${dollars(s.costs)} selling costs.`,
    ])
  }
  const lines = [[`Plan: ${planName}`], ...notes, [], header, ...rows]
  return lines.map((r) => r.map(cell).join(',')).join('\n')
}

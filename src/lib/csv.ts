import { dayToISO } from '../engine/dates'
import { financialYearLabel, type ManualResult } from '../engine/manual'

const dollars = (cents: number) => (Math.round(cents) / 100).toFixed(2)

function cell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/** Year-by-year results as a CSV spreadsheet file. */
export function yearTableCsv(result: ManualResult, planName: string): string {
  const header = ['Financial year', 'From', 'To', 'Opening balance', 'Put in', 'Taken out', 'Growth', 'Closing balance']
  const rows = result.years.map((y) => [
    financialYearLabel(y.fy),
    dayToISO(y.firstDay),
    dayToISO(y.lastDay),
    dollars(y.opening),
    dollars(y.deposits),
    dollars(y.withdrawals),
    dollars(y.growth),
    dollars(y.closing),
  ])
  const lines = [[`Plan: ${planName}`], ['Manual mode, using the return rates entered. An estimate, not a guarantee.'], [], header, ...rows]
  return lines.map((r) => r.map(cell).join(',')).join('\n')
}

export function downloadText(filename: string, text: string, type = 'text/csv') {
  const blob = new Blob([text], { type: `${type};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

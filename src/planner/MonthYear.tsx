// Month + year picker for "roughly when you bought it" (stored as the 1st of the month).

import { NumberInput, Select } from '../components/inputs'
import { parseISO, toISO } from '../engine/dates'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function MonthYear({ id, value, startDate, onChange }: { id: string; value: string; startDate: string; onChange: (iso: string) => void }) {
  const { y, m } = parseISO(value)
  const set = (year: number, month: number) => {
    const iso = toISO({ y: year, m: month, d: 1 })
    const start = parseISO(startDate)
    // Picking the plan's start month means "bought on the start date".
    onChange(year === start.y && month === start.m ? startDate : iso)
  }
  return (
    <span className="month-year">
      <Select id={id} label="Month you bought it" value={String(m)} options={MONTHS.map((name, i) => ({ value: String(i + 1), label: name }))} onChange={(v) => set(y, Number(v))} />
      <NumberInput label="Year you bought it" width="sm" integer min={1900} value={y} onChange={(year) => year >= 1900 && year <= 9999 && set(year, m)} />
    </span>
  )
}

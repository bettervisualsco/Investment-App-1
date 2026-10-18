// Chart times: "YYYY-MM-DD" strings for day charts, unix seconds for 5-minute charts.

import type { Time } from 'lightweight-charts'

const pad = (n: number) => String(n).padStart(2, '0')

/** Any chart time as "YYYY-MM-DD" (day charts) or null for 5-minute charts. */
export function timeISO(t: Time): string | null {
  if (typeof t === 'number') return null
  if (typeof t === 'string') return t
  return `${t.year}-${pad(t.month)}-${pad(t.day)}`
}

// Calendar date helpers. Dates are plain "YYYY-MM-DD" strings (no time, no
// time zone) so a plan gives the same answer on any device. Internally we turn
// them into a whole-day number (days since 1970-01-01) for counting.

export type ISODate = string // "YYYY-MM-DD"

const MS_PER_DAY = 86_400_000

export interface YMD {
  y: number
  m: number // 1-12
  d: number // 1-31
}

export function parseISO(date: ISODate): YMD {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) throw new Error(`Not a valid date: "${date}"`)
  const y = Number(match[1])
  const m = Number(match[2])
  const d = Number(match[3])
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) throw new Error(`Not a valid date: "${date}"`)
  return { y, m, d }
}

export function isValidISO(date: string): boolean {
  try {
    parseISO(date)
    return true
  } catch {
    return false
  }
}

export function toISO({ y, m, d }: YMD): ISODate {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
}

export function daysInMonth(y: number, m: number): number {
  if (m === 2) return isLeapYear(y) ? 29 : 28
  return [4, 6, 9, 11].includes(m) ? 30 : 31
}

/** Whole days since 1970-01-01. */
export function toDayNumber(date: ISODate | YMD): number {
  const { y, m, d } = typeof date === 'string' ? parseISO(date) : date
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY)
}

export function fromDayNumber(day: number): YMD {
  const dt = new Date(day * MS_PER_DAY)
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() }
}

export function dayToISO(day: number): ISODate {
  return toISO(fromDayNumber(day))
}

/**
 * Add whole calendar months. If the day doesn't exist in the new month it is
 * clamped to the month's last day (31 Jan + 1 month = 28/29 Feb). Always add
 * from the original anchor date, never chain, so 31 Jan → 28 Feb → 31 Mar.
 */
export function addMonths(date: YMD, months: number): YMD {
  const total = date.y * 12 + (date.m - 1) + months
  const y = Math.floor(total / 12)
  const m = (total % 12) + 1
  return { y, m, d: Math.min(date.d, daysInMonth(y, m)) }
}

/** Australian financial year that a day falls in, named by the year it ends (FY2027 = 1 Jul 2026 – 30 Jun 2027). */
export function financialYearOf(day: number): number {
  const { y, m } = fromDayNumber(day)
  return m >= 7 ? y + 1 : y
}

/** First day (as a day number) of the financial year that ends in `fyEnd`. */
export function financialYearStart(fyEnd: number): number {
  return toDayNumber({ y: fyEnd - 1, m: 7, d: 1 })
}

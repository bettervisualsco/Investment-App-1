// "Prices as of 3:42pm · updated 6 min ago", and whether data is getting old. Pure functions.

const SYDNEY = 'Australia/Sydney'

/** The calendar date ("YYYY-MM-DD") in a time zone. */
export function dateIn(timeZone: string, at: Date): string {
  // en-CA formats dates as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
}

function weekday(iso: string): number {
  return new Date(`${iso}T12:00:00Z`).getUTCDay() // 0 = Sunday
}

/** Weekdays after `from` up to and including `to` (both "YYYY-MM-DD"). */
export function weekdaysBetween(from: string, to: string): number {
  let count = 0
  const d = new Date(`${from}T12:00:00Z`)
  const end = new Date(`${to}T12:00:00Z`)
  while (d < end) {
    d.setUTCDate(d.getUTCDate() + 1)
    const w = d.getUTCDay()
    if (w !== 0 && w !== 6) count++
  }
  return count
}

/**
 * True when prices are more than 2 trading days old on a weekday (Sydney time): time for a gentle
 * warning. Weekends never warn, and Monday morning with Friday's prices is normal.
 * `asOf` is a date ("YYYY-MM-DD") or a time ("...T...Z").
 */
export function isStale(asOf: string | undefined, now: Date = new Date()): boolean {
  if (!asOf) return true
  const today = dateIn(SYDNEY, now)
  const w = weekday(today)
  if (w === 0 || w === 6) return false
  const asOfDate = asOf.includes('T') ? dateIn(SYDNEY, new Date(asOf)) : asOf.slice(0, 10)
  return weekdaysBetween(asOfDate, today) > 2
}

/** "just now", "6 min ago", "3 hours ago", "2 days ago". */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const mins = Math.round((now.getTime() - Date.parse(iso)) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

/** "3:42pm" today, "Fri 3:42pm" this week, otherwise "16 Oct". Shown in the device's time zone. */
export function asOfText(asOf: string, now: Date = new Date(), timeZone?: string): string {
  if (!asOf.includes('T')) {
    // a plain date (daily closing prices)
    const d = new Date(`${asOf}T12:00:00Z`)
    const part = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-AU', { ...o, timeZone: 'UTC' }).format(d)
    return `${part({ weekday: 'short' })} ${part({ day: 'numeric' })} ${part({ month: 'short' })} close`
  }
  const at = new Date(asOf)
  const tz = timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  const time = new Intl.DateTimeFormat('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz })
    .format(at)
    .replace(/\s/g, '')
    .toLowerCase()
  const sameDay = dateIn(tz, at) === dateIn(tz, now)
  if (sameDay) return time
  if (now.getTime() - at.getTime() < 6 * 86_400_000) {
    return `${new Intl.DateTimeFormat('en-AU', { weekday: 'short', timeZone: tz }).format(at)} ${time}`
  }
  return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', timeZone: tz }).format(at)
}

/** The small label shown wherever data appears: "Prices as of 3:42pm · updated 6 min ago". */
export function freshnessLabel(asOf: string | undefined, updatedAt: string | undefined, now: Date = new Date(), timeZone?: string): string {
  const parts: string[] = []
  if (asOf) parts.push(`Prices as of ${asOfText(asOf, now, timeZone)}`)
  if (updatedAt) parts.push(`updated ${timeAgo(updatedAt, now)}`)
  return parts.join(' · ') || 'No data yet'
}

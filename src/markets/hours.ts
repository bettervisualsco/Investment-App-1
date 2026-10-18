// Is the ASX / New York Stock Exchange open right now? Pure functions, no screen code.
//
// Each market's hours are in its own city's time (Sydney, New York), so daylight saving in either
// city is handled by the time-zone database built into every browser (Intl). Public holidays and
// early closes come from the exchanges' own published calendars (below). For years after the last
// published calendar, only weekends are known; the status then says holidays aren't checked.

export type Exchange = 'asx' | 'nyse'

interface ExchangeInfo {
  name: string
  city: string
  timeZone: string
  /** Normal trading, local time, minutes after midnight. */
  open: number
  close: number
  /** Close time on early-close days. */
  earlyClose: number
  /** "YYYY-MM-DD" → holiday name (market closed all day). */
  holidays: Record<string, string>
  /** "YYYY-MM-DD" → reason (market closes early). */
  earlyCloses: Record<string, string>
  /** The last day the published holiday calendar covers. */
  knownUntil: string
  source: string
  checkedOn: string
}

const hm = (h: number, m = 0) => h * 60 + m

export const EXCHANGES: Record<Exchange, ExchangeInfo> = {
  asx: {
    name: 'ASX',
    city: 'Sydney',
    timeZone: 'Australia/Sydney',
    // Normal trading 10:00am–4:00pm. The closing auction finishes about 4:10pm.
    open: hm(10),
    close: hm(16),
    earlyClose: hm(14, 10),
    holidays: {
      '2026-01-01': "New Year's Day",
      '2026-01-26': 'Australia Day',
      '2026-04-03': 'Good Friday',
      '2026-04-06': 'Easter Monday',
      '2026-06-08': "King's Birthday",
      '2026-12-25': 'Christmas Day',
      '2026-12-28': 'Boxing Day',
      '2027-01-01': "New Year's Day",
      '2027-01-26': 'Australia Day',
      '2027-03-26': 'Good Friday',
      '2027-03-29': 'Easter Monday',
      '2027-06-14': "King's Birthday",
      '2027-12-27': 'Christmas Day (observed)',
      '2027-12-28': 'Boxing Day (observed)',
    },
    earlyCloses: {
      '2026-12-24': 'Christmas Eve',
      '2026-12-31': "New Year's Eve",
      '2027-12-24': 'Christmas Eve',
      '2027-12-31': "New Year's Eve",
    },
    knownUntil: '2027-12-31',
    source: 'https://www.asx.com.au/markets/market-resources/trading-hours-calendar/cash-market-trading-hours/trading-calendar',
    checkedOn: '2026-10-18',
  },
  nyse: {
    name: 'NYSE',
    city: 'New York',
    timeZone: 'America/New_York',
    open: hm(9, 30),
    close: hm(16),
    earlyClose: hm(13),
    holidays: {
      '2026-01-01': "New Year's Day",
      '2026-01-19': 'Martin Luther King Jr. Day',
      '2026-02-16': "Washington's Birthday",
      '2026-04-03': 'Good Friday',
      '2026-05-25': 'Memorial Day',
      '2026-06-19': 'Juneteenth',
      '2026-07-03': 'Independence Day (observed)',
      '2026-09-07': 'Labor Day',
      '2026-11-26': 'Thanksgiving',
      '2026-12-25': 'Christmas Day',
      '2027-01-01': "New Year's Day",
      '2027-01-18': 'Martin Luther King Jr. Day',
      '2027-02-15': "Washington's Birthday",
      '2027-03-26': 'Good Friday',
      '2027-05-31': 'Memorial Day',
      '2027-06-18': 'Juneteenth (observed)',
      '2027-07-05': 'Independence Day (observed)',
      '2027-09-06': 'Labor Day',
      '2027-11-25': 'Thanksgiving',
      '2027-12-24': 'Christmas Day (observed)',
      '2028-01-17': 'Martin Luther King Jr. Day',
      '2028-02-21': "Washington's Birthday",
      '2028-04-14': 'Good Friday',
      '2028-05-29': 'Memorial Day',
      '2028-06-19': 'Juneteenth',
      '2028-07-04': 'Independence Day',
      '2028-09-04': 'Labor Day',
      '2028-11-23': 'Thanksgiving',
      '2028-12-25': 'Christmas Day',
    },
    earlyCloses: {
      '2026-11-27': 'the day after Thanksgiving',
      '2026-12-24': 'Christmas Eve',
      '2027-11-26': 'the day after Thanksgiving',
      '2028-07-03': 'the day before Independence Day',
      '2028-11-24': 'the day after Thanksgiving',
    },
    knownUntil: '2028-12-31',
    source: 'https://www.nyse.com/markets/hours-calendars',
    checkedOn: '2026-10-18',
  },
}

interface LocalTime {
  date: string
  /** Minutes after local midnight. */
  minutes: number
  /** 0 = Sunday … 6 = Saturday */
  weekday: number
}

const partsFormatters = new Map<string, Intl.DateTimeFormat>()

/** The local calendar date, time and weekday in a time zone. */
export function localTime(timeZone: string, at: Date): LocalTime {
  let f = partsFormatters.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
    partsFormatters.set(timeZone, f)
  }
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]))
  const date = `${p.year}-${p.month}-${p.day}`
  return { date, minutes: Number(p.hour) * 60 + Number(p.minute), weekday: new Date(`${date}T12:00:00Z`).getUTCDay() }
}

/** The moment (UTC) when a wall-clock time happens in a time zone, e.g. 10:00am on 2026-10-19 in Sydney. */
export function zonedTime(timeZone: string, date: string, minutes: number): Date {
  const [y, m, d] = date.split('-').map(Number)
  const wall = Date.UTC(y, m - 1, d, 0, minutes)
  // Guess with the offset at that moment, then correct once (handles daylight-saving changes).
  let guess = wall
  for (let i = 0; i < 2; i++) {
    const lt = localTime(timeZone, new Date(guess))
    const [ly, lm, ld] = lt.date.split('-').map(Number)
    const seenAsWall = Date.UTC(ly, lm - 1, ld, 0, lt.minutes)
    guess += wall - seenAsWall
  }
  return new Date(guess)
}

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export interface DayHours {
  trading: boolean
  /** Why it's closed all day. */
  closedFor?: 'weekend' | string
  open?: number
  close?: number
  /** Why it closes early, if it does. */
  early?: string
}

/** Trading hours for one local date. */
export function dayHours(ex: Exchange, date: string): DayHours {
  const info = EXCHANGES[ex]
  const w = new Date(`${date}T12:00:00Z`).getUTCDay()
  if (w === 0 || w === 6) return { trading: false, closedFor: 'weekend' }
  const holiday = info.holidays[date]
  if (holiday) return { trading: false, closedFor: holiday }
  const early = info.earlyCloses[date]
  return { trading: true, open: info.open, close: early ? info.earlyClose : info.close, early }
}

export interface MarketStatus {
  exchange: Exchange
  open: boolean
  /** When it closes (if open now). */
  closesAt?: Date
  /** When it next opens (if closed now). */
  opensAt?: Date
  /** Holiday name, if today is a holiday. */
  holiday?: string
  /** Early-close reason, if today closes early. */
  early?: string
  /** false when today is past the published holiday calendar (holidays not checked). */
  holidaysKnown: boolean
}

/** Open or closed at a moment, and when that changes next. */
export function marketStatus(ex: Exchange, at: Date = new Date()): MarketStatus {
  const info = EXCHANGES[ex]
  const lt = localTime(info.timeZone, at)
  const today = dayHours(ex, lt.date)
  const holidaysKnown = lt.date <= info.knownUntil
  const base = { exchange: ex, holidaysKnown, holiday: today.trading || today.closedFor === 'weekend' ? undefined : today.closedFor, early: today.early }
  if (today.trading && lt.minutes >= (today.open as number) && lt.minutes < (today.close as number)) {
    return { ...base, open: true, closesAt: zonedTime(info.timeZone, lt.date, today.close as number) }
  }
  // Closed: find the next opening, starting today (if it hasn't opened yet) or tomorrow.
  let date = today.trading && lt.minutes < (today.open as number) ? lt.date : addDays(lt.date, 1)
  for (let i = 0; i < 14; i++, date = addDays(date, 1)) {
    const h = dayHours(ex, date)
    if (h.trading) return { ...base, open: false, opensAt: zonedTime(info.timeZone, date, h.open as number) }
  }
  return { ...base, open: false }
}

/** The AUD/USD currency market trades around the clock from Monday morning in Asia to Friday 5pm New York time. */
export function fxOpen(at: Date = new Date()): boolean {
  const lt = localTime('America/New_York', at)
  if (lt.weekday === 6) return false
  if (lt.weekday === 5 && lt.minutes >= hm(17)) return false
  if (lt.weekday === 0 && lt.minutes < hm(17)) return false
  return true
}

const timeFmt = (timeZone: string | undefined, withDay: boolean) =>
  new Intl.DateTimeFormat('en-AU', { timeZone, hour: 'numeric', minute: '2-digit', hour12: true, ...(withDay ? { weekday: 'short' } : {}) })

/** "4:00pm", or "Mon 10:00am" when it's not today. In the device's time zone unless one is given. */
export function clockText(when: Date, now: Date, timeZone?: string): string {
  const tz = timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  const sameDay = localTime(tz, when).date === localTime(tz, now).date
  return timeFmt(tz, !sameDay)
    .format(when)
    .replace(/\s?(am|pm)/i, (m) => m.trim().toLowerCase())
    .replace(',', '')
}

/** "Open · closes 4:00pm", "Closed · opens Mon 10:00am", "Closed for Good Friday · opens Tue 10:00am". */
export function statusText(s: MarketStatus, now: Date = new Date(), timeZone?: string): string {
  if (s.open) return `Open · closes ${clockText(s.closesAt as Date, now, timeZone)}${s.early ? ' (early close)' : ''}`
  const head = s.holiday ? `Closed for ${s.holiday}` : 'Closed'
  return s.opensAt ? `${head} · opens ${clockText(s.opensAt, now, timeZone)}` : head
}

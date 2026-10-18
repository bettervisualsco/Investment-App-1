import { describe, expect, it } from 'vitest'
import { dayHours, fxOpen, localTime, marketStatus, statusText, zonedTime } from './hours'

const at = (iso: string) => new Date(iso)

describe('local time in each city', () => {
  it('follows daylight saving in Sydney (starts 4 Oct 2026)', () => {
    // 00:30 UTC is 10:30am in winter (UTC+10) and 11:30am in summer (UTC+11)
    expect(localTime('Australia/Sydney', at('2026-09-28T00:30:00Z'))).toMatchObject({ date: '2026-09-28', minutes: 10 * 60 + 30 })
    expect(localTime('Australia/Sydney', at('2026-10-05T00:30:00Z'))).toMatchObject({ date: '2026-10-05', minutes: 11 * 60 + 30 })
  })

  it('turns a wall-clock time into the right moment', () => {
    expect(zonedTime('Australia/Sydney', '2026-09-28', 600).toISOString()).toBe('2026-09-28T00:00:00.000Z') // AEST
    expect(zonedTime('Australia/Sydney', '2026-10-19', 600).toISOString()).toBe('2026-10-18T23:00:00.000Z') // AEDT
    expect(zonedTime('America/New_York', '2026-10-30', 570).toISOString()).toBe('2026-10-30T13:30:00.000Z') // EDT
    expect(zonedTime('America/New_York', '2026-11-02', 570).toISOString()).toBe('2026-11-02T14:30:00.000Z') // EST
    expect(zonedTime('America/New_York', '2027-03-15', 570).toISOString()).toBe('2027-03-15T13:30:00.000Z') // EDT again
    expect(zonedTime('Australia/Sydney', '2027-04-05', 600).toISOString()).toBe('2027-04-05T00:00:00.000Z') // AEST again
  })
})

describe('ASX open or closed', () => {
  it('opens at 10am Sydney time, whichever side of daylight saving', () => {
    // Winter: 10am = 00:00 UTC
    expect(marketStatus('asx', at('2026-09-27T23:59:00Z')).open).toBe(false) // 9:59am Mon 28 Sep
    expect(marketStatus('asx', at('2026-09-28T00:00:00Z')).open).toBe(true)
    // Summer: 10am = 23:00 UTC the day before. 23:30 UTC Sunday is 10:30am Monday.
    expect(marketStatus('asx', at('2026-10-18T23:30:00Z')).open).toBe(true)
    // ...and the same UTC time a month earlier was only 9:30am
    expect(marketStatus('asx', at('2026-09-20T23:30:00Z')).open).toBe(false)
  })

  it('closes at 4pm', () => {
    const s = marketStatus('asx', at('2026-10-19T04:59:00Z')) // 3:59pm AEDT
    expect(s.open).toBe(true)
    expect(s.closesAt?.toISOString()).toBe('2026-10-19T05:00:00.000Z')
    expect(marketStatus('asx', at('2026-10-19T05:00:00Z')).open).toBe(false)
  })

  it('is closed at weekends and on public holidays, and knows when it opens next', () => {
    const sat = marketStatus('asx', at('2026-10-17T01:00:00Z')) // Sat noon
    expect(sat.open).toBe(false)
    expect(sat.opensAt?.toISOString()).toBe('2026-10-18T23:00:00.000Z') // Mon 10am AEDT
    const xmas = marketStatus('asx', at('2026-12-24T23:30:00Z')) // Fri 25 Dec, 10:30am
    expect(xmas).toMatchObject({ open: false, holiday: 'Christmas Day' })
    // Boxing Day is moved to Mon 28 Dec, so the next open is Tue 29 Dec 10am AEDT
    expect(xmas.opensAt?.toISOString()).toBe('2026-12-28T23:00:00.000Z')
    expect(marketStatus('asx', at('2027-03-26T00:00:00Z')).holiday).toBe('Good Friday')
  })

  it('closes early (2:10pm) on Christmas Eve and New Year’s Eve', () => {
    expect(dayHours('asx', '2026-12-24')).toMatchObject({ trading: true, close: 14 * 60 + 10, early: 'Christmas Eve' })
    expect(marketStatus('asx', at('2026-12-24T03:00:00Z')).open).toBe(true) // 2:00pm
    expect(marketStatus('asx', at('2026-12-24T03:15:00Z')).open).toBe(false) // 2:15pm
  })

  it('says when holidays are past the published calendar', () => {
    expect(marketStatus('asx', at('2026-10-19T00:00:00Z')).holidaysKnown).toBe(true)
    expect(marketStatus('asx', at('2028-03-01T00:00:00Z')).holidaysKnown).toBe(false)
  })
})

describe('NYSE open or closed', () => {
  it('opens at 9:30am New York time on both sides of the US clock change (1 Nov 2026)', () => {
    // Fri 30 Oct (EDT, UTC−4): 9:45am = 13:45 UTC
    expect(marketStatus('nyse', at('2026-10-30T13:45:00Z')).open).toBe(true)
    // Mon 2 Nov (EST, UTC−5): 13:45 UTC is only 8:45am
    expect(marketStatus('nyse', at('2026-11-02T13:45:00Z')).open).toBe(false)
    expect(marketStatus('nyse', at('2026-11-02T14:45:00Z')).open).toBe(true)
    // closes 4pm EST = 21:00 UTC
    expect(marketStatus('nyse', at('2026-11-02T14:45:00Z')).closesAt?.toISOString()).toBe('2026-11-02T21:00:00.000Z')
  })

  it('handles the March clock change while Sydney is still on summer time', () => {
    // Mon 15 Mar 2027: New York is on EDT again (UTC−4), opens 13:30 UTC
    expect(marketStatus('nyse', at('2027-03-15T13:35:00Z')).open).toBe(true)
    // Fri 12 Mar 2027 (still EST): 13:35 UTC is 8:35am
    expect(marketStatus('nyse', at('2027-03-12T13:35:00Z')).open).toBe(false)
  })

  it('knows US holidays and early closes', () => {
    const thanksgiving = marketStatus('nyse', at('2026-11-26T16:00:00Z'))
    expect(thanksgiving).toMatchObject({ open: false, holiday: 'Thanksgiving' })
    // next open is Fri 27 Nov 9:30am EST, which closes early at 1pm
    expect(thanksgiving.opensAt?.toISOString()).toBe('2026-11-27T14:30:00.000Z')
    expect(marketStatus('nyse', at('2026-11-27T17:30:00Z')).open).toBe(true) // 12:30pm
    expect(marketStatus('nyse', at('2026-11-27T18:30:00Z')).open).toBe(false) // 1:30pm
    expect(marketStatus('nyse', at('2027-07-05T15:00:00Z')).holiday).toBe('Independence Day (observed)')
  })
})

describe('AUD/USD', () => {
  it('trades all week, from Sunday 5pm to Friday 5pm New York time', () => {
    expect(fxOpen(at('2026-10-16T20:00:00Z'))).toBe(true) // Fri 4pm EDT
    expect(fxOpen(at('2026-10-16T21:30:00Z'))).toBe(false) // Fri 5:30pm EDT
    expect(fxOpen(at('2026-10-17T12:00:00Z'))).toBe(false) // Saturday
    expect(fxOpen(at('2026-10-18T20:59:00Z'))).toBe(false) // Sun 4:59pm EDT
    expect(fxOpen(at('2026-10-18T21:01:00Z'))).toBe(true) // Sun 5:01pm EDT
  })
})

describe('status words', () => {
  it('reads naturally, in the device time zone', () => {
    const now = at('2026-10-17T01:00:00Z') // Sat noon in Sydney
    expect(statusText(marketStatus('asx', now), now, 'Australia/Sydney')).toBe('Closed · opens Mon 10:00am')
    const open = at('2026-10-19T00:00:00Z')
    expect(statusText(marketStatus('asx', open), open, 'Australia/Sydney')).toBe('Open · closes 4:00pm')
    // NYSE in Sydney time: Mon 19 Oct 9:30am EDT = Tue 20 Oct 12:30am AEDT
    expect(statusText(marketStatus('nyse', open), open, 'Australia/Sydney')).toBe('Closed · opens Tue 12:30am')
    const xmas = at('2026-12-24T23:30:00Z')
    expect(statusText(marketStatus('asx', xmas), xmas, 'Australia/Sydney')).toBe('Closed for Christmas Day · opens Tue 10:00am')
  })
})

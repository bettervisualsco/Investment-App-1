// Working out *when* things happen: where each phase starts and ends, and
// which days a regular deposit lands on.

import { addMonths, fromDayNumber, toDayNumber } from './dates'
import type { Duration, Frequency, Plan } from './types'

/** Day number `k` lots of `duration` after `anchorDay`. Months/years are calendar months (clamped to month end). */
export function addDuration(anchorDay: number, duration: Duration, k = 1): number {
  const n = duration.count * k
  switch (duration.unit) {
    case 'days':
      return anchorDay + n
    case 'weeks':
      return anchorDay + 7 * n
    case 'fortnights':
      return anchorDay + 14 * n
    case 'months':
      return toDayNumber(addMonths(fromDayNumber(anchorDay), n))
    case 'years':
      return toDayNumber(addMonths(fromDayNumber(anchorDay), 12 * n))
    case 'decades':
      return toDayNumber(addMonths(fromDayNumber(anchorDay), 120 * n))
  }
}

export interface PhaseRange {
  phaseId: string
  /** First day of the phase. */
  start: number
  /** First day AFTER the phase (exclusive). */
  end: number
}

/** Calendar months in a month-based duration (months, years, decades), or null for days, weeks and fortnights. */
function monthsIn(duration: Duration): number | null {
  if (duration.unit === 'months') return duration.count
  if (duration.unit === 'years') return 12 * duration.count
  if (duration.unit === 'decades') return 120 * duration.count
  return null
}

/**
 * Phases run back to back from the plan's start date.
 *
 * Month-based ends are counted from an anchor (the plan's start, or the end of the last phase measured in days,
 * weeks or fortnights), never from the previous phase's end. Otherwise a clamped month end would carry on:
 * from 31 Jan, "1 month" ends on 28 Feb and "11 more months" should end on 31 Jan, not 28 Jan.
 */
export function phaseRanges(plan: Plan): PhaseRange[] {
  let start = toDayNumber(plan.startDate)
  let anchor = fromDayNumber(start)
  let monthsSinceAnchor = 0
  return plan.phases.map((phase) => {
    const months = monthsIn(phase.duration)
    let end: number
    if (months === null) {
      end = addDuration(start, phase.duration)
      anchor = fromDayNumber(end)
      monthsSinceAnchor = 0
    } else {
      monthsSinceAnchor += months
      end = toDayNumber(addMonths(anchor, monthsSinceAnchor))
    }
    const range = { phaseId: phase.id, start, end }
    start = end
    return range
  })
}

/**
 * Days on which a regular deposit lands, from `start` (inclusive) to `end`
 * (exclusive). The first deposit lands on the first day; after that, every
 * period. Monthly-type deposits keep the same day of the month (clamped to
 * the month end, e.g. the 31st becomes the 30th in a 30-day month).
 */
export function paymentDays(start: number, end: number, frequency: Frequency): number[] {
  const days: number[] = []
  if (frequency === 'none') return days
  const step: Duration | null =
    frequency === 'daily'
      ? { count: 1, unit: 'days' }
      : frequency === 'weekly'
        ? { count: 1, unit: 'weeks' }
        : frequency === 'fortnightly'
          ? { count: 1, unit: 'fortnights' }
          : frequency === 'monthly'
            ? { count: 1, unit: 'months' }
            : frequency === 'quarterly'
              ? { count: 3, unit: 'months' }
              : { count: 1, unit: 'years' }
  for (let k = 0; ; k++) {
    const day = addDuration(start, step, k)
    if (day >= end) break
    days.push(day)
  }
  return days
}

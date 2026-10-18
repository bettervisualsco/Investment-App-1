// GitHub's 60-day rule, read from meta.json (see notes/stage-2.md).

import type { Meta } from '../data/types'

const DAY = 86_400_000
export const QUIET_DAYS = 45

/**
 * GitHub turns scheduled updates off after 60 days with no activity in a public repository.
 * The age is worked out here from the last commit's date and the current time: if GitHub has
 * switched the schedule off, the pipeline isn't running, so a number stored by it would never change.
 */
export function quietRepoWarning(meta: Meta | null, now: Date = new Date()): string | null {
  if (!meta) return null
  const last = meta.repo?.lastCommit ? Date.parse(meta.repo.lastCommit) : NaN
  if (Number.isFinite(last)) {
    const days = Math.floor((now.getTime() - last) / DAY)
    // Recent activity means any older "github" problem has been dealt with.
    return days >= QUIET_DAYS ? `The app’s online copy hasn’t changed for ${days} days.` : null
  }
  // No commit date recorded: fall back to the pipeline's own warning, if any.
  return meta.problems.find((p) => p.where === 'github')?.message ?? null
}

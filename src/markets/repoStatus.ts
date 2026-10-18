// GitHub's 60-day rule, read from meta.json (see notes/stage-2.md).

import type { Meta } from '../data/types'

/** GitHub turns scheduled updates off after 60 days with no activity in a public repository. */
export function quietRepoWarning(meta: Meta | null): string | null {
  if (!meta) return null
  const days = meta.repo?.daysSinceCommit
  const problem = meta.problems.find((p) => p.where === 'github')
  if ((days ?? 0) >= 45) return `The app’s online copy hasn’t changed for ${days} days.`
  return problem ? problem.message : null
}

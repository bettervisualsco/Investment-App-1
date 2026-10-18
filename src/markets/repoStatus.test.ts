import { describe, expect, it } from 'vitest'
import type { Meta } from '../data/types'
import { quietRepoWarning } from './repoStatus'

const meta = (lastCommit: string | null, problems: Meta['problems'] = []): Meta => ({
  schema: 1,
  generatedAt: '2026-10-18T09:16:00Z',
  files: {},
  sources: {},
  tasks: {},
  problems,
  ...(lastCommit ? { repo: { lastCommit, daysSinceCommit: 0 } } : {}),
})

const daysAfter = (iso: string, days: number) => new Date(Date.parse(iso) + days * 86_400_000)
const commit = '2026-10-18T09:15:03Z'

describe("GitHub's 60-day rule warning", () => {
  it('stays quiet while the repository is active', () => {
    expect(quietRepoWarning(meta(commit), daysAfter(commit, 0))).toBeNull()
    expect(quietRepoWarning(meta(commit), daysAfter(commit, 44))).toBeNull()
    expect(quietRepoWarning(null)).toBeNull()
  })

  it('warns from 45 quiet days, counted from today even though the stored file never changed', () => {
    // The pipeline last ran (and stored daysSinceCommit: 0) 50 days ago, then GitHub switched it off.
    expect(quietRepoWarning(meta(commit), daysAfter(commit, 50))).toContain('50 days')
  })

  it('ignores an old "github" problem once commits have resumed', () => {
    const old = [{ at: '2026-08-01T00:00:00Z', where: 'github', message: 'No commits for 50 days.' }]
    expect(quietRepoWarning(meta(commit, old), daysAfter(commit, 1))).toBeNull()
  })

  it("passes on the pipeline's own warning when no commit date is recorded", () => {
    const m = meta(null, [{ at: '2026-10-18T09:16:00Z', where: 'github', message: 'No commits for 50 days.' }])
    expect(quietRepoWarning(m)).toBe('No commits for 50 days.')
  })
})

import { describe, expect, it } from 'vitest'
import type { Meta } from '../data/types'
import { quietRepoWarning } from './repoStatus'

const meta = (daysSinceCommit: number, problems: Meta['problems'] = []): Meta => ({
  schema: 1,
  generatedAt: '2026-10-18T09:16:00Z',
  files: {},
  sources: {},
  tasks: {},
  problems,
  repo: { lastCommit: '2026-10-18T09:15:03Z', daysSinceCommit },
})

describe("GitHub's 60-day rule warning", () => {
  it('stays quiet while the repository is active', () => {
    expect(quietRepoWarning(meta(0))).toBeNull()
    expect(quietRepoWarning(meta(44))).toBeNull()
    expect(quietRepoWarning(null)).toBeNull()
  })

  it('warns from 45 quiet days', () => {
    expect(quietRepoWarning(meta(45))).toContain('45 days')
  })

  it("passes on the pipeline's own warning", () => {
    const m = meta(10, [{ at: '2026-10-18T09:16:00Z', where: 'github', message: 'No commits for 50 days.' }])
    expect(quietRepoWarning(m)).toBe('No commits for 50 days.')
  })
})

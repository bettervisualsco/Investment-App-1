import { describe, expect, it } from 'vitest'
import type { Plan } from '../engine/types'
import type { SavedPlanRecord } from '../state/db'
import {
  BACKUP_FORMAT_VERSION,
  IMPORTED_SUFFIX,
  backupFileName,
  backupToText,
  makeBackup,
  planImport,
  planShapeProblem,
  readBackup,
  resolveImport,
} from './backup'
import { samePlan, stableStringify } from './samePlan'

function plan(id: string, name: string, extra: Record<string, unknown> = {}): Plan {
  return {
    id,
    name,
    startDate: '2026-10-18',
    startingBalance: 100_000,
    currency: 'AUD',
    phases: [
      {
        id: 'p1',
        name: 'Uni',
        duration: { count: 4, unit: 'years' },
        depositFrequency: 'weekly',
        deposit: { kind: 'ramp', from: 5_000, to: 10_000, shape: 'slowThenFast', startAfter: { count: 0, unit: 'months' } },
        returnRate: { kind: 'steps', from: 6, stepBy: 0.5, every: { count: 1, unit: 'years' } },
      },
    ],
    events: [{ id: 'e1', name: 'Car', date: '2030-01-01', amount: -1_500_000 }],
    goal: { amount: 10_000_000, date: '2040-01-01' },
    ...extra,
  } as Plan
}

const rec = (p: Plan, createdAt = 1000, updatedAt = 2000): SavedPlanRecord => ({ id: p.id, plan: p, createdAt, updatedAt })

let n = 0
const makeId = () => `new-${++n}`

function fileWith(plans: unknown[], over: Record<string, unknown> = {}): string {
  return JSON.stringify({ app: 'investment-planner', kind: 'plans-backup', formatVersion: 1, exportedAt: '2026-10-18T00:00:00.000Z', plans, ...over })
}

describe('backup round trip', () => {
  it('reads back exactly what was written, including unknown fields from later versions', () => {
    const records = [rec(plan('a', 'Alpha', { fees: { mer: 0.07 }, taxOn: true })), rec(plan('b', 'Bravo'), 5, 6)]
    const text = backupToText(makeBackup(records, new Date('2026-10-18T05:00:00Z')))
    const read = readBackup(text)
    expect(read.ok).toBe(true)
    if (!read.ok) return
    expect(read.skipped).toEqual([])
    expect(read.exportedAt).toBe('2026-10-18T05:00:00.000Z')
    expect(read.entries).toEqual(records.map((r) => ({ plan: r.plan, createdAt: r.createdAt, updatedAt: r.updatedAt })))
  })

  it('writes the app name, kind and format version', () => {
    const b = JSON.parse(backupToText(makeBackup([])))
    expect(b).toMatchObject({ app: 'investment-planner', kind: 'plans-backup', formatVersion: BACKUP_FORMAT_VERSION, plans: [] })
  })

  it('a backup with no plans reads fine', () => {
    const read = readBackup(backupToText(makeBackup([])))
    expect(read).toMatchObject({ ok: true, entries: [], skipped: [] })
  })

  it('copes with a byte-order mark at the start (some apps add one)', () => {
    expect(readBackup('﻿' + fileWith([])).ok).toBe(true)
  })

  it('names files with the date, and a plan name when exporting one plan', () => {
    const d = new Date(2026, 9, 18, 9, 30)
    expect(backupFileName(d)).toBe('Plans backup 2026-10-18.json')
    expect(backupFileName(d, 'Dad’s retirement / v2')).toBe('Dads retirement v2 2026-10-18.json')
    expect(backupFileName(d, '***')).toBe('Plans backup 2026-10-18.json')
  })
})

describe('bad files are refused with a clear message', () => {
  const refused = (text: string) => {
    const r = readBackup(text)
    expect(r.ok).toBe(false)
    return r.ok ? '' : r.error
  }

  it('not JSON at all', () => {
    expect(refused('hello, this is a photo')).toMatch(/isn’t a plans backup/)
    expect(refused('')).toMatch(/isn’t a plans backup/)
  })

  it('JSON, but not from this app', () => {
    expect(refused('{"name":"package","version":"1.0.0"}')).toMatch(/isn’t a plans backup/)
    expect(refused('[1,2,3]')).toMatch(/isn’t a plans backup/)
    expect(refused('null')).toMatch(/isn’t a plans backup/)
    expect(refused(fileWith([], { app: 'something-else' }))).toMatch(/isn’t a plans backup/)
    expect(refused(fileWith([], { kind: 'settings' }))).toMatch(/isn’t a plans backup/)
  })

  it('from a newer version of the app', () => {
    expect(refused(fileWith([], { formatVersion: BACKUP_FORMAT_VERSION + 1 }))).toMatch(/newer version/)
  })

  it('damaged version or plan list', () => {
    expect(refused(fileWith([], { formatVersion: 'one' }))).toMatch(/damaged/)
    expect(refused(fileWith([], { formatVersion: 0 }))).toMatch(/damaged/)
    expect(refused(fileWith([], { formatVersion: 1.5 }))).toMatch(/damaged/)
    expect(refused(fileWith([], { plans: 'lots' }))).toMatch(/damaged/)
  })

  it('cut off half way (e.g. a failed copy)', () => {
    const text = backupToText(makeBackup([rec(plan('a', 'A'))]))
    expect(refused(text.slice(0, text.length / 2))).toMatch(/isn’t a plans backup/)
  })

  it('far too big', () => {
    expect(refused(' '.repeat(10 * 1024 * 1024 + 1))).toMatch(/too big/)
  })
})

describe('damaged plans inside a good file are skipped, the rest still import', () => {
  it('skips and explains each damaged plan', () => {
    const good = plan('good', 'Good one')
    const noPhases = { ...plan('np', 'No phases'), phases: undefined }
    const badDeposit = plan('bd', 'Bad deposit')
    ;(badDeposit.phases[0] as unknown as Record<string, unknown>).deposit = { kind: 'fixed', value: '20' }
    const r = readBackup(fileWith([{ plan: good, createdAt: 1, updatedAt: 2 }, { plan: noPhases }, { plan: badDeposit }, 'junk', { nothing: true }]))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.entries.map((e) => e.plan.id)).toEqual(['good'])
    expect(r.skipped).toEqual([
      { name: 'No phases', reason: 'its phases are missing' },
      { name: 'Bad deposit', reason: 'phase “Uni” has a damaged deposit' },
      { name: 'Plan 4 in the file', reason: 'it isn’t a plan' },
      { name: 'Plan 5 in the file', reason: 'it isn’t a plan' },
    ])
  })

  it('fills in missing dates instead of refusing', () => {
    const r = readBackup(fileWith([{ plan: plan('a', 'A') }]))
    expect(r.ok && r.entries[0].createdAt > 0 && r.entries[0].updatedAt === r.entries[0].createdAt).toBe(true)
  })

  it('checks every part the app needs', () => {
    expect(planShapeProblem(plan('a', 'A'))).toBeNull()
    expect(planShapeProblem({ ...plan('a', 'A'), goal: undefined })).toBeNull()
    expect(planShapeProblem({ ...plan('a', 'A'), id: '' })).toBe('it has no id')
    expect(planShapeProblem({ ...plan('a', 'A'), currency: 'EUR' })).toBe('its currency isn’t AUD or USD')
    expect(planShapeProblem({ ...plan('a', 'A'), startingBalance: '100' })).toBe('its starting balance isn’t a number')
    expect(planShapeProblem({ ...plan('a', 'A'), events: [{ id: 'e', name: 'x', date: '2030-01-01' }] })).toBe('a one-off event is damaged')
    expect(planShapeProblem({ ...plan('a', 'A'), goal: { amount: 5 } })).toBe('its goal is damaged')
    const p = plan('a', 'A')
    expect(planShapeProblem({ ...p, phases: [{ ...p.phases[0], duration: { count: 4, unit: 'aeons' } }] })).toBe('phase “Uni” has a damaged length')
    expect(planShapeProblem({ ...p, phases: [{ ...p.phases[0], depositFrequency: 'hourly' }] })).toBe('phase “Uni” has a damaged deposit frequency')
    expect(planShapeProblem({ ...p, phases: [{ ...p.phases[0], returnRate: { kind: 'steps', from: 6, stepBy: 1 } }] })).toBe('phase “Uni” has a damaged return rate')
    expect(planShapeProblem({ ...p, phases: [{ ...p.phases[0], deposit: { kind: 'ramp', from: 1, to: 2, shape: 'wobbly' } }] })).toBe('phase “Uni” has a damaged deposit')
  })
})

describe('importing next to plans already on this device', () => {
  const alpha = plan('a', 'Alpha')
  const bravo = plan('b', 'Bravo')
  const here = [rec(alpha), rec(bravo)]

  it('sorts plans into new, already here, and different', () => {
    const bravoEdited = { ...bravo, startingBalance: 999 }
    const charlie = plan('c', 'Charlie')
    const entries = [alpha, bravoEdited, charlie].map((p) => ({ plan: p, createdAt: 10, updatedAt: 20 }))
    const items = planImport(entries, here, makeId)
    expect(items.map((i) => [i.entry.plan.id, i.status])).toEqual([
      ['a', 'same'],
      ['b', 'different'],
      ['c', 'new'],
    ])
  })

  it('counts a plan as the same even if its keys are in a different order', () => {
    const reordered = Object.fromEntries(Object.entries(alpha).reverse()) as unknown as Plan
    expect(Object.keys(reordered)[0]).not.toBe(Object.keys(alpha)[0])
    expect(planImport([{ plan: reordered, createdAt: 1, updatedAt: 1 }], here, makeId)[0].status).toBe('same')
  })

  it('never overwrites without being told to', () => {
    const bravoEdited = { ...bravo, startingBalance: 999 }
    const items = planImport([{ plan: bravoEdited, createdAt: 10, updatedAt: 20 }], here, makeId)

    const keep = resolveImport(items, 'keepBoth', makeId)
    expect(keep.keptBoth).toBe(1)
    expect(keep.put).toHaveLength(1)
    expect(keep.put[0].id).not.toBe('b')
    expect(keep.put[0].plan.id).toBe(keep.put[0].id)
    expect(keep.put[0].plan.name).toBe(`Bravo${IMPORTED_SUFFIX}`)
    expect(keep.put[0].plan.startingBalance).toBe(999)

    const skip = resolveImport(items, 'skip', makeId)
    expect(skip).toMatchObject({ put: [], skipped: 1 })

    const replace = resolveImport(items, 'replace', makeId)
    expect(replace.replaced).toBe(1)
    expect(replace.put[0]).toEqual({ id: 'b', plan: bravoEdited, createdAt: 1000, updatedAt: 20 })
  })

  it('does nothing for plans that are already here', () => {
    const items = planImport([{ plan: alpha, createdAt: 1, updatedAt: 1 }], here, makeId)
    expect(resolveImport(items, 'replace', makeId)).toMatchObject({ put: [], alreadyHere: 1 })
  })

  it('adds new plans with their dates from the file', () => {
    const charlie = plan('c', 'Charlie', { extra: 1 })
    const out = resolveImport(planImport([{ plan: charlie, createdAt: 5, updatedAt: 6 }], here, makeId), 'skip', makeId)
    expect(out).toMatchObject({ added: 1, put: [{ id: 'c', plan: charlie, createdAt: 5, updatedAt: 6 }] })
  })

  it('handles the same plan twice in one file', () => {
    const charlie = plan('c', 'Charlie')
    const charlie2 = { ...charlie, name: 'Charlie, edited' }
    const items = planImport(
      [charlie, charlie, charlie2].map((p) => ({ plan: p, createdAt: 1, updatedAt: 1 })),
      [],
      makeId,
    )
    expect(items).toHaveLength(2)
    expect(items.every((i) => i.status === 'new')).toBe(true)
    expect(items[0].entry.plan.id).toBe('c')
    expect(items[1].entry.plan.id).not.toBe('c')
    expect(items[1].entry.plan.name).toBe('Charlie, edited')
  })

  it('importing the same backup twice adds nothing the second time', () => {
    const text = backupToText(makeBackup(here))
    const read = readBackup(text)
    if (!read.ok) throw new Error(read.error)
    const out = resolveImport(planImport(read.entries, here, makeId), 'keepBoth', makeId)
    expect(out).toMatchObject({ put: [], alreadyHere: 2 })
  })
})

describe('comparing plan contents', () => {
  it('ignores key order and missing optional fields', () => {
    expect(stableStringify({ b: 1, a: [1, { d: 2, c: 3 }] })).toBe('{"a":[1,{"c":3,"d":2}],"b":1}')
    expect(samePlan({ a: 1, goal: undefined }, { a: 1 })).toBe(true)
    expect(samePlan({ a: 1 }, { a: 2 })).toBe(false)
  })
})

describe('settings added in later stages (fees, tax, inflation, prediction)', () => {
  const full = plan('a', 'A', {
    realism: { fees: true, tax: true, inflation: false, feeSettings: { brokerage: { kind: 'flat', fee: 500 } }, inflationSettings: { rate: { kind: 'fixed', value: 2.5 } } },
    prediction: { mode: 'prediction', window: 'since1990', runs: 1000 },
  })
  full.phases[0] = {
    ...full.phases[0],
    mer: 0.07,
    otherIncome: 5_000_000,
    distribution: { yield: 3, frankedPct: 80, foreignPct: 0, foreignTaxPct: 15, frequency: 'quarterly' },
    investment: { kind: 'etf', etf: 'VAS' },
  }

  it('accepts a plan that uses them, and keeps them through a backup round trip', () => {
    expect(planShapeProblem(full)).toBeNull()
    const read = readBackup(backupToText(makeBackup([rec(full)])))
    expect(read.ok && read.entries[0].plan).toEqual(full)
  })

  it('rejects damaged versions instead of letting them break the Planner', () => {
    const p0 = full.phases[0]
    expect(planShapeProblem({ ...full, realism: { fees: 'yes', tax: true, inflation: false } })).toBe('its Fees, Tax and Inflation settings are damaged')
    expect(planShapeProblem({ ...full, realism: { ...full.realism, taxSettings: 'x' } })).toBe('its Fees, Tax and Inflation settings are damaged')
    expect(planShapeProblem({ ...full, realism: { ...full.realism, inflationSettings: { rate: 3 } } })).toBe('its inflation rate is damaged')
    expect(planShapeProblem({ ...full, prediction: { mode: 'guess' } })).toBe('its Prediction settings are damaged')
    expect(planShapeProblem({ ...full, phases: [{ ...p0, mer: '0.07' }] })).toBe('phase “Uni” has damaged tax or fee settings')
    expect(planShapeProblem({ ...full, phases: [{ ...p0, distribution: { yield: 3 } }] })).toBe('phase “Uni” has damaged distribution settings')
    expect(planShapeProblem({ ...full, phases: [{ ...p0, investment: 'VAS' }] })).toBe('phase “Uni” has a damaged investment')
  })
})

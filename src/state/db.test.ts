// Checks the database upgrade (version 1 → 2) keeps the current plan, and the
// saved-plans functions work. Uses a pretend IndexedDB that runs in tests.

import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { beforeAll, describe, expect, it } from 'vitest'
import type { Plan } from '../engine/types'
import { CURRENT_DRAFT, DB_NAME, db, loadDraft, saveDraft } from './db'
import { COPY_SUFFIX, deletePlan, duplicatePlan, listPlans, putImported, renamePlan, savePlan } from './plans'

function plan(id: string, name: string, extra: Record<string, unknown> = {}): Plan {
  return {
    id,
    name,
    startDate: '2026-10-18',
    startingBalance: 100_000,
    currency: 'AUD',
    phases: [
      { id: 'p1', name: 'First job', duration: { count: 5, unit: 'years' }, depositFrequency: 'monthly', deposit: { kind: 'fixed', value: 20_000 }, returnRate: { kind: 'fixed', value: 7 } },
    ],
    events: [],
    ...extra,
  } as Plan
}

describe('database upgrade from version 1 (stage 1) to version 2', () => {
  const stage1Draft = plan('draft-1', 'My stage-1 plan', { someFutureField: { feesOn: true } })

  beforeAll(async () => {
    // Make a database exactly like stage 1 did, with a current plan in it.
    const old = new Dexie(DB_NAME)
    old.version(1).stores({ drafts: 'key' })
    await old.table('drafts').put({ key: CURRENT_DRAFT, schemaVersion: 1, plan: stage1Draft, savedAt: 123 })
    old.close()
  })

  it('keeps the current plan, unknown fields and all', async () => {
    expect(await loadDraft()).toEqual(stage1Draft)
    expect(db.verno).toBe(2)
    const raw = await db.drafts.get(CURRENT_DRAFT)
    expect(raw?.savedAt).toBe(123)
  })

  it('adds an empty plans table', async () => {
    expect(db.tables.map((t) => t.name).sort()).toEqual(['drafts', 'plans'])
    expect(await db.plans.count()).toBe(0)
  })

  it('still autosaves the current plan after the upgrade', async () => {
    const edited = { ...stage1Draft, name: 'Edited' }
    await saveDraft(edited)
    expect(await loadDraft()).toEqual(edited)
  })
})

describe('saved plans', () => {
  it('saves, then updates the same plan without losing when it was first saved', async () => {
    const first = await savePlan(plan('a', 'Alpha'), 1000)
    expect(first).toMatchObject({ id: 'a', createdAt: 1000, updatedAt: 1000 })
    const second = await savePlan(plan('a', 'Alpha v2'), 2000)
    expect(second).toMatchObject({ id: 'a', createdAt: 1000, updatedAt: 2000 })
    expect((await db.plans.get('a'))?.plan.name).toBe('Alpha v2')
  })

  it('keeps fields it doesn’t know about (added by later stages)', async () => {
    const p = plan('future', 'Future', { switches: { tax: true }, phasesExtra: [1, 2] })
    await savePlan(p, 1500)
    expect((await db.plans.get('future'))?.plan).toEqual(p)
  })

  it('lists most recently changed first', async () => {
    await savePlan(plan('b', 'Bravo'), 3000)
    expect((await listPlans()).map((r) => r.id)).toEqual(['b', 'a', 'future'])
  })

  it('renames', async () => {
    await renamePlan('b', 'Bravo renamed', 4000)
    const rec = await db.plans.get('b')
    expect(rec?.plan.name).toBe('Bravo renamed')
    expect(rec?.updatedAt).toBe(4000)
  })

  it('duplicates with a new id and leaves the original alone', async () => {
    const copy = await duplicatePlan('a', 5000)
    expect(copy).not.toBeNull()
    expect(copy!.id).not.toBe('a')
    expect(copy!.plan.id).toBe(copy!.id)
    expect(copy!.plan.name).toBe(`Alpha v2${COPY_SUFFIX}`)
    expect(copy!.plan.phases).toEqual((await db.plans.get('a'))!.plan.phases)
    expect((await db.plans.get('a'))?.plan.name).toBe('Alpha v2')
  })

  it('deletes', async () => {
    await deletePlan('b')
    expect(await db.plans.get('b')).toBeUndefined()
  })

  it('imports several plans at once', async () => {
    await putImported([
      { id: 'x', plan: plan('x', 'X'), createdAt: 1, updatedAt: 2 },
      { id: 'y', plan: plan('y', 'Y'), createdAt: 1, updatedAt: 2 },
    ])
    expect(await db.plans.get('x')).toBeDefined()
    expect(await db.plans.get('y')).toBeDefined()
  })

  it('saving plans never touches the current plan', async () => {
    expect((await loadDraft())?.name).toBe('Edited')
  })
})

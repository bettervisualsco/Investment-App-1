// Saved plans on this device: save, rename, duplicate, delete, import.

import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'
import type { Plan } from '../engine/types'
import { newId } from '../lib/id'
import { db, type SavedPlanRecord } from './db'

/** All saved plans, most recently changed first. */
export async function listPlans(): Promise<SavedPlanRecord[]> {
  return db.plans.orderBy('updatedAt').reverse().toArray()
}

/** Saves a plan (adds it, or updates the saved copy with the same id). */
export async function savePlan(plan: Plan, now = Date.now()): Promise<SavedPlanRecord> {
  const record = await db.transaction('rw', db.plans, async () => {
    const existing = await db.plans.get(plan.id)
    const rec: SavedPlanRecord = { id: plan.id, plan, createdAt: existing?.createdAt ?? now, updatedAt: now }
    await db.plans.put(rec)
    return rec
  })
  askToKeepStorage()
  return record
}

export async function renamePlan(id: string, name: string, now = Date.now()): Promise<void> {
  await db.transaction('rw', db.plans, async () => {
    const rec = await db.plans.get(id)
    if (!rec) return
    await db.plans.put({ ...rec, plan: { ...rec.plan, name }, updatedAt: now })
  })
}

export const COPY_SUFFIX = ' (copy)'

/** Makes a copy with its own id, named "… (copy)". */
export async function duplicatePlan(id: string, now = Date.now()): Promise<SavedPlanRecord | null> {
  return db.transaction('rw', db.plans, async () => {
    const rec = await db.plans.get(id)
    if (!rec) return null
    const copyId = newId()
    const copy: SavedPlanRecord = { id: copyId, plan: { ...structuredClone(rec.plan), id: copyId, name: `${rec.plan.name}${COPY_SUFFIX}` }, createdAt: now, updatedAt: now }
    await db.plans.add(copy)
    return copy
  })
}

export async function deletePlan(id: string): Promise<void> {
  await db.plans.delete(id)
}

/** Writes imported plans in one go: either all of them are saved, or none. */
export async function putImported(records: SavedPlanRecord[]): Promise<void> {
  await db.transaction('rw', db.plans, async () => {
    await db.plans.bulkPut(records)
  })
  if (records.length) askToKeepStorage()
}

/**
 * Asks the browser not to clear this app's storage when the device is low on
 * space. Browsers may say no; that's fine, it's only a request.
 */
function askToKeepStorage() {
  try {
    void navigator.storage?.persist?.().catch(() => {})
  } catch {
    // Not supported here.
  }
}

/** Live list of saved plans: updates by itself whenever they change. `null` while loading. */
export function useSavedPlans(): SavedPlanRecord[] | null {
  const [plans, setPlans] = useState<SavedPlanRecord[] | null>(null)
  useEffect(() => {
    const sub = liveQuery(listPlans).subscribe({
      next: setPlans,
      error: () => setPlans([]),
    })
    return () => sub.unsubscribe()
  }, [])
  return plans
}

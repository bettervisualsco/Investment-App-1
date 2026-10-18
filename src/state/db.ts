// On-device storage (IndexedDB, via Dexie). Nothing leaves the device.
//
// Tables:
//   drafts: the plan open in the Planner right now (one row, key "current").
//           It saves itself as you type.
//   plans:  plans you chose to save in the Saved tab (added in version 2).
//
// Plans are stored whole, exactly as given, so any fields added by later
// stages are kept even by code that doesn't know about them.

import Dexie, { type Table } from 'dexie'
import type { Plan } from '../engine/types'

export interface DraftRecord {
  key: string
  schemaVersion: number
  plan: Plan
  savedAt: number
}

export interface SavedPlanRecord {
  /** Same as plan.id. */
  id: string
  plan: Plan
  /** Milliseconds since 1970 (Date.now()). */
  createdAt: number
  updatedAt: number
}

export const DB_NAME = 'investment-planner'

export class PlannerDB extends Dexie {
  drafts!: Table<DraftRecord, string>
  plans!: Table<SavedPlanRecord, string>

  constructor(name = DB_NAME) {
    super(name)
    this.version(1).stores({ drafts: 'key' })
    // Version 2 only adds the plans table. The drafts table (and the current
    // plan in it) is left exactly as it was.
    this.version(2).stores({ drafts: 'key', plans: 'id, updatedAt' })
  }
}

export const db = new PlannerDB()

export const CURRENT_DRAFT = 'current'
export const SCHEMA_VERSION = 1

export async function loadDraft(): Promise<Plan | null> {
  try {
    const record = await db.drafts.get(CURRENT_DRAFT)
    return record?.plan ?? null
  } catch {
    return null
  }
}

export async function saveDraft(plan: Plan): Promise<void> {
  try {
    await db.drafts.put({ key: CURRENT_DRAFT, schemaVersion: SCHEMA_VERSION, plan, savedAt: Date.now() })
  } catch {
    // Storage can be unavailable (e.g. private browsing). The app still works; it just won't remember.
  }
}

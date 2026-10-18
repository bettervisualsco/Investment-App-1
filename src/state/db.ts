// On-device storage (IndexedDB, via Dexie). Nothing leaves the device.

import Dexie, { type Table } from 'dexie'
import type { Plan } from '../engine/types'

export interface DraftRecord {
  key: string
  schemaVersion: number
  plan: Plan
  savedAt: number
}

class PlannerDB extends Dexie {
  drafts!: Table<DraftRecord, string>

  constructor() {
    super('investment-planner')
    this.version(1).stores({ drafts: 'key' })
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

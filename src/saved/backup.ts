// The backup file: how plans move between the iPhone and the Mac.
//
// It's a plain JSON text file:
//   {
//     "app": "investment-planner",
//     "kind": "plans-backup",
//     "formatVersion": 1,
//     "exportedAt": "2026-10-18T05:12:00.000Z",
//     "plans": [ { "plan": { ...the whole plan... }, "createdAt": 1760..., "updatedAt": 1760... } ]
//   }
//
// Rules:
//   - Plans are written out whole, so fields added by later versions of the
//     app travel with them, even if this code doesn't know what they are.
//   - Reading checks everything the app needs before anything is saved. A
//     damaged plan is skipped (and reported); the rest still import.
//   - Importing never quietly overwrites a plan on this device. If a plan in
//     the file has the same id as one here but different content, you choose:
//     keep both, replace, or skip.
//
// No storage or screen code here, so it can be tested on its own.

import type { Plan } from '../engine/types'
import type { SavedPlanRecord } from '../state/db'
import { samePlan } from './samePlan'

export const BACKUP_APP = 'investment-planner'
export const BACKUP_KIND = 'plans-backup'
/** Bump this when the file layout changes in a way older versions can't read. */
export const BACKUP_FORMAT_VERSION = 1
/** Real backups are tiny (a few KB per plan). Anything this big isn't one. */
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024

export interface BackupEntry {
  plan: Plan
  createdAt: number
  updatedAt: number
}

export interface BackupFile {
  app: typeof BACKUP_APP
  kind: typeof BACKUP_KIND
  formatVersion: number
  exportedAt: string
  plans: BackupEntry[]
}

// ---------------------------------------------------------------- writing

export function makeBackup(records: SavedPlanRecord[], now: Date = new Date()): BackupFile {
  return {
    app: BACKUP_APP,
    kind: BACKUP_KIND,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: now.toISOString(),
    plans: records.map((r) => ({ plan: r.plan, createdAt: r.createdAt, updatedAt: r.updatedAt })),
  }
}

export function backupToText(backup: BackupFile): string {
  return JSON.stringify(backup, null, 2)
}

function localDate(now: Date): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** "Plans backup 2026-10-18.json", or "Retirement 2026-10-18.json" for a single plan. */
export function backupFileName(now: Date = new Date(), planName?: string): string {
  const cleaned = planName?.replace(/[^\w -]+/g, '').replace(/\s+/g, ' ').trim()
  return `${cleaned || 'Plans backup'} ${localDate(now)}.json`
}

// ---------------------------------------------------------------- reading

export interface SkippedPlan {
  name: string
  reason: string
}

export type ReadResult =
  | { ok: true; entries: BackupEntry[]; skipped: SkippedPlan[]; exportedAt: string | null }
  | { ok: false; error: string }

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const isStr = (x: unknown): x is string => typeof x === 'string'

const DURATION_UNITS = ['days', 'weeks', 'fortnights', 'months', 'years', 'decades']
const FREQUENCIES = ['none', 'daily', 'weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly']
const SHAPES = ['linear', 'slowThenFast', 'fastThenSlow']
const CURRENCIES = ['AUD', 'USD']

function durationOk(x: unknown): boolean {
  return isObject(x) && isNum(x.count) && isStr(x.unit) && DURATION_UNITS.includes(x.unit)
}

function optionalDurationOk(x: unknown): boolean {
  return x === undefined || durationOk(x)
}

function varyingOk(x: unknown): boolean {
  if (!isObject(x)) return false
  switch (x.kind) {
    case 'fixed':
      return isNum(x.value)
    case 'ramp':
      return isNum(x.from) && isNum(x.to) && isStr(x.shape) && SHAPES.includes(x.shape) && optionalDurationOk(x.startAfter) && optionalDurationOk(x.lasts)
    case 'steps':
      return isNum(x.from) && isNum(x.stepBy) && durationOk(x.every) && optionalDurationOk(x.startAfter) && optionalDurationOk(x.lasts)
    default:
      return false
  }
}

/**
 * Checks a plan has everything the app needs to open it. Returns null if it's
 * fine, or a short reason if not. Extra fields are allowed and kept.
 * (Whether the numbers make sense, e.g. a negative balance, is the Planner's
 * job: it shows those as fixable problems.)
 */
export function planShapeProblem(x: unknown): string | null {
  if (!isObject(x)) return 'it isn’t a plan'
  if (!isStr(x.id) || x.id.trim() === '') return 'it has no id'
  if (!isStr(x.name)) return 'it has no name'
  if (!isStr(x.startDate)) return 'it has no start date'
  if (!isNum(x.startingBalance)) return 'its starting balance isn’t a number'
  if (!isStr(x.currency) || !CURRENCIES.includes(x.currency)) return 'its currency isn’t AUD or USD'
  if (!Array.isArray(x.phases)) return 'its phases are missing'
  for (const p of x.phases) {
    if (!isObject(p) || !isStr(p.id) || !isStr(p.name)) return 'a phase is damaged'
    if (!durationOk(p.duration)) return `phase “${p.name}” has a damaged length`
    if (!isStr(p.depositFrequency) || !FREQUENCIES.includes(p.depositFrequency)) return `phase “${p.name}” has a damaged deposit frequency`
    if (!varyingOk(p.deposit)) return `phase “${p.name}” has a damaged deposit`
    if (!varyingOk(p.returnRate)) return `phase “${p.name}” has a damaged return rate`
    // Settings added in later stages are optional, but if present they must have the right shape.
    for (const key of ['mer', 'otherIncome', 'marginalRate'] as const) {
      if (p[key] !== undefined && !isNum(p[key])) return `phase “${p.name}” has damaged tax or fee settings`
    }
    if (p.distribution !== undefined && !(isObject(p.distribution) && ['yield', 'frankedPct', 'foreignPct', 'foreignTaxPct'].every((k) => isNum((p.distribution as Record<string, unknown>)[k])))) {
      return `phase “${p.name}” has damaged distribution settings`
    }
    if (p.investment !== undefined && !(isObject(p.investment) && isStr(p.investment.kind))) return `phase “${p.name}” has a damaged investment`
  }
  if (x.realism !== undefined && !(isObject(x.realism) && ['fees', 'tax', 'inflation'].every((k) => typeof (x.realism as Record<string, unknown>)[k] === 'boolean'))) {
    return 'its Fees, Tax and Inflation settings are damaged'
  }
  if (isObject(x.realism)) {
    for (const k of ['feeSettings', 'taxSettings', 'inflationSettings']) {
      const v = x.realism[k]
      if (v !== undefined && !isObject(v)) return 'its Fees, Tax and Inflation settings are damaged'
    }
    const infl = x.realism.inflationSettings
    if (isObject(infl) && !varyingOk(infl.rate)) return 'its inflation rate is damaged'
  }
  if (x.prediction !== undefined && !(isObject(x.prediction) && (x.prediction.mode === 'manual' || x.prediction.mode === 'prediction'))) {
    return 'its Prediction settings are damaged'
  }
  const money = startingMoneyShapeProblem(x.startingMoney)
  if (money) return money
  if (!Array.isArray(x.events)) return 'its one-off events are missing'
  for (const e of x.events) {
    if (!isObject(e) || !isStr(e.id) || !isStr(e.name) || !isStr(e.date) || !isNum(e.amount)) return 'a one-off event is damaged'
  }
  if (x.goal !== undefined && x.goal !== null && !(isObject(x.goal) && isNum(x.goal.amount) && isStr(x.goal.date))) return 'its goal is damaged'
  return null
}

/** "Money you have now" (optional): if present, it must have the right shape. */
function startingMoneyShapeProblem(x: unknown): string | null {
  if (x === undefined) return null
  const damaged = 'its “Money you have now” is damaged'
  if (!isObject(x) || (x.entry !== 'single' && x.entry !== 'holdings')) return damaged
  if (x.handling !== undefined && x.handling !== 'keep' && x.handling !== 'move') return damaged
  const detailsOk = (d: unknown): boolean => {
    if (!isObject(d)) return false
    if (d.investment !== undefined && !(isObject(d.investment) && isStr(d.investment.kind))) return false
    for (const k of ['costBase', 'returnRate', 'mer']) if (d[k] !== undefined && !isNum(d[k])) return false
    if (d.boughtOn !== undefined && !isStr(d.boughtOn)) return false
    if (d.usListed !== undefined && typeof d.usListed !== 'boolean') return false
    if (d.distribution !== undefined && !(isObject(d.distribution) && ['yield', 'frankedPct', 'foreignPct', 'foreignTaxPct'].every((k) => isNum((d.distribution as Record<string, unknown>)[k])))) return false
    return true
  }
  if (x.single !== undefined && !detailsOk(x.single)) return damaged
  if (x.holdings !== undefined) {
    if (!Array.isArray(x.holdings)) return damaged
    for (const h of x.holdings) {
      if (!isObject(h) || !isStr(h.id) || !isNum(h.value) || (h.name !== undefined && !isStr(h.name)) || !detailsOk(h)) return 'one of its holdings in “Money you have now” is damaged'
    }
  }
  return null
}

const NOT_A_BACKUP = 'This file isn’t a plans backup from this app. Pick the .json file you made with “Back up all plans”.'
const DAMAGED = 'This backup file is damaged, so nothing was imported.'

/** Reads and checks a backup file's text. Nothing is saved here. */
export function readBackup(text: string): ReadResult {
  if (text.length > MAX_BACKUP_BYTES) return { ok: false, error: 'This file is far too big to be a plans backup.' }
  let data: unknown
  try {
    data = JSON.parse(text.replace(/^﻿/, ''))
  } catch {
    return { ok: false, error: NOT_A_BACKUP }
  }
  if (!isObject(data) || data.app !== BACKUP_APP || data.kind !== BACKUP_KIND) return { ok: false, error: NOT_A_BACKUP }
  const version = data.formatVersion
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return { ok: false, error: DAMAGED }
  if (version > BACKUP_FORMAT_VERSION) {
    return { ok: false, error: 'This backup was made by a newer version of the app. Close and reopen the app on this device to update it, then try again.' }
  }
  if (!Array.isArray(data.plans)) return { ok: false, error: DAMAGED }

  const now = Date.now()
  const entries: BackupEntry[] = []
  const skipped: SkippedPlan[] = []
  data.plans.forEach((raw, i) => {
    const plan = isObject(raw) ? raw.plan : undefined
    const name = isObject(plan) && isStr(plan.name) && plan.name.trim() ? plan.name : `Plan ${i + 1} in the file`
    const problem = isObject(raw) ? planShapeProblem(plan) : 'it isn’t a plan'
    if (problem) {
      skipped.push({ name, reason: problem })
      return
    }
    const r = raw as Record<string, unknown>
    const createdAt = isNum(r.createdAt) ? r.createdAt : now
    const updatedAt = isNum(r.updatedAt) ? r.updatedAt : createdAt
    entries.push({ plan: plan as unknown as Plan, createdAt, updatedAt })
  })

  return { ok: true, entries, skipped, exportedAt: isStr(data.exportedAt) ? data.exportedAt : null }
}

// ---------------------------------------------------------------- importing

/**
 * What would happen to each plan in the file:
 *   new:       nothing with its id on this device, so it's added.
 *   same:      already on this device, identical. Nothing to do.
 *   different: a plan with the same id is here but its content differs. You choose.
 */
export type ImportItem =
  | { status: 'new'; entry: BackupEntry }
  | { status: 'same'; entry: BackupEntry; existing: SavedPlanRecord }
  | { status: 'different'; entry: BackupEntry; existing: SavedPlanRecord }

/** Compares the file's plans with the ones on this device. Nothing is saved here. */
export function planImport(entries: BackupEntry[], existing: SavedPlanRecord[], makeId: () => string): ImportItem[] {
  const here = new Map(existing.map((r) => [r.id, r]))
  const seenInFile = new Map<string, BackupEntry>()
  const items: ImportItem[] = []

  for (const original of entries) {
    let entry = original
    const earlier = seenInFile.get(entry.plan.id)
    if (earlier) {
      // The same id twice in one file: drop exact repeats, give the others their own id.
      if (samePlan(earlier.plan, entry.plan)) continue
      entry = { ...entry, plan: { ...entry.plan, id: makeId() } }
    }
    seenInFile.set(entry.plan.id, entry)

    const match = here.get(entry.plan.id)
    if (!match) items.push({ status: 'new', entry })
    else if (samePlan(match.plan, entry.plan)) items.push({ status: 'same', entry, existing: match })
    else items.push({ status: 'different', entry, existing: match })
  }
  return items
}

/** For plans that differ from the one on this device. */
export type ConflictChoice = 'keepBoth' | 'replace' | 'skip'

export interface ImportOutcome {
  /** Records to write to the device. */
  put: SavedPlanRecord[]
  added: number
  replaced: number
  keptBoth: number
  alreadyHere: number
  skipped: number
}

export const IMPORTED_SUFFIX = ' (from backup)'

/** Turns the plan from planImport plus your choice into records to save. */
export function resolveImport(items: ImportItem[], choice: ConflictChoice, makeId: () => string): ImportOutcome {
  const out: ImportOutcome = { put: [], added: 0, replaced: 0, keptBoth: 0, alreadyHere: 0, skipped: 0 }
  for (const item of items) {
    const { plan, createdAt, updatedAt } = item.entry
    if (item.status === 'new') {
      out.put.push({ id: plan.id, plan, createdAt, updatedAt })
      out.added++
    } else if (item.status === 'same') {
      out.alreadyHere++
    } else if (choice === 'replace') {
      out.put.push({ id: plan.id, plan, createdAt: item.existing.createdAt, updatedAt })
      out.replaced++
    } else if (choice === 'keepBoth') {
      const id = makeId()
      out.put.push({ id, plan: { ...plan, id, name: `${plan.name}${IMPORTED_SUFFIX}` }, createdAt, updatedAt })
      out.keptBoth++
    } else {
      out.skipped++
    }
  }
  return out
}

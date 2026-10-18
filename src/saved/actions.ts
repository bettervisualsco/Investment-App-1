// Things the Saved tab does that aren't screen code.

import type { SavedPlanRecord } from '../state/db'
import { backupFileName, backupToText, makeBackup } from './backup'
import { saveTextFile } from './files'

const when = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
/** 18 Oct 2026, 3:42 pm */
export const changedOn = (ms: number) => when.format(new Date(ms))

/**
 * Saves a backup file. Must be called straight from a tap (no waiting first),
 * or iPhone won't open the share sheet.
 */
export async function exportPlans(records: SavedPlanRecord[], single = false): Promise<string> {
  const now = new Date()
  const outcome = await saveTextFile(backupToText(makeBackup(records, now)), backupFileName(now, single ? records[0]?.plan.name || 'Plan' : undefined))
  const what = single ? 'This plan' : records.length === 1 ? '1 plan' : `${records.length} plans`
  if (outcome === 'cancelled') return ''
  if (outcome === 'shared') return `${what} shared as a backup file.`
  return `${what} saved as a backup file (look in your Downloads folder).`
}

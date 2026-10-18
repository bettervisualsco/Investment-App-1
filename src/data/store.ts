// The market data saved on this device (IndexedDB, via Dexie), so the app works offline.
// Kept in its own database, separate from the user's plans.

import Dexie, { type Table } from 'dexie'
import type { Meta } from './types'

export interface StoredFile {
  /** Path inside /data, e.g. "daily/VAS.json". */
  path: string
  hash: string
  data: unknown
  savedAt: number
}

export interface StoredInfo {
  key: 'meta'
  /** The last meta.json we downloaded. */
  meta: Meta
  /** Fingerprints of the files actually saved here (a download can fail and leave an older copy). */
  hashes: Record<string, string>
  /** When we last managed to reach the website (ms). */
  checkedAt: number
}

export class MarketDataDB extends Dexie {
  files!: Table<StoredFile, string>
  info!: Table<StoredInfo, string>

  constructor(name = 'investment-market-data') {
    super(name)
    this.version(1).stores({ files: 'path', info: 'key' })
  }
}

let shared: MarketDataDB | null = null

export function marketDb(): MarketDataDB {
  shared ??= new MarketDataDB()
  return shared
}

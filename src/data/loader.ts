// Keeping the device's copy of the market data up to date.
// 1. Download meta.json (small). 2. Compare each file's fingerprint with the copy on the device.
// 3. Download only the files that changed. 4. Save them. If anything fails, the saved copy stays,
// and with no internet at all the app carries on with what it has (and says so).

import { marketDb, type MarketDataDB } from './store'
import type { Meta } from './types'

export interface SyncOptions {
  /** Where the data folder is, ending in "/". Default: the app's own /data/ folder. */
  baseUrl?: string
  fetchFn?: typeof fetch
  db?: MarketDataDB
  /** Choose which files to keep on the device (default: all of them). */
  include?: (path: string) => boolean
  /** How many files to download at once. */
  concurrency?: number
}

export interface SyncResult {
  /** updated: new data saved · unchanged: already up to date · offline: couldn't reach the website */
  status: 'updated' | 'unchanged' | 'offline'
  /** Files that were downloaded and saved this time. */
  changed: string[]
  /** Files that changed on the website but couldn't be downloaded (the old copy is kept). */
  failed: string[]
  /** Files no longer on the website, so removed from the device. */
  removed: string[]
  meta: Meta | null
  /** When the website was last reached (ms), even if that was an earlier sync. */
  checkedAt: number | null
  error?: string
}

export function defaultBaseUrl(): string {
  return `${import.meta.env.BASE_URL}data/`
}

function looksLikeMeta(x: unknown): x is Meta {
  return typeof x === 'object' && x !== null && typeof (x as Meta).files === 'object' && (x as Meta).files !== null
}

export async function syncData(opts: SyncOptions = {}): Promise<SyncResult> {
  const db = opts.db ?? marketDb()
  const base = opts.baseUrl ?? defaultBaseUrl()
  const fetchFn = opts.fetchFn ?? fetch.bind(globalThis)
  const include = opts.include ?? (() => true)
  const saved = await db.info.get('meta').catch(() => undefined)

  let meta: Meta
  try {
    // GitHub Pages lets browsers cache files for 10 minutes, so ask for a fresh copy explicitly.
    const res = await fetchFn(`${base}meta.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) throw new Error(`meta.json: HTTP ${res.status}`)
    const json: unknown = await res.json()
    if (!looksLikeMeta(json)) throw new Error('meta.json is not in the expected format')
    meta = json
  } catch (e) {
    return {
      status: 'offline',
      changed: [],
      failed: [],
      removed: [],
      meta: saved?.meta ?? null,
      checkedAt: saved?.checkedAt ?? null,
      error: e instanceof Error ? e.message : String(e),
    }
  }

  const hashes: Record<string, string> = { ...(saved?.hashes ?? {}) }
  const wanted = Object.entries(meta.files).filter(([path]) => include(path))
  const todo = wanted.filter(([path, entry]) => hashes[path] !== entry.hash)
  const changed: string[] = []
  const failed: string[] = []

  const queue = [...todo]
  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      const [path, entry] = item
      try {
        // The fingerprint in the address means a cached old copy can never be used by mistake.
        const res = await fetchFn(`${base}${path}?v=${entry.hash}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data: unknown = await res.json()
        if (typeof data !== 'object' || data === null) throw new Error('empty file')
        await db.files.put({ path, hash: entry.hash, data, savedAt: Date.now() })
        hashes[path] = entry.hash
        changed.push(path)
      } catch {
        failed.push(path)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency ?? 4) }, worker))

  // Forget files the website no longer has (e.g. an ETF removed from the watchlist).
  const gone = Object.keys(hashes).filter((p) => !(p in meta.files) || !include(p))
  if (gone.length) {
    await db.files.bulkDelete(gone)
    gone.forEach((p) => delete hashes[p])
  }

  const checkedAt = Date.now()
  await db.info.put({ key: 'meta', meta, hashes, checkedAt })
  changed.sort()
  return { status: changed.length || gone.length ? 'updated' : 'unchanged', changed, failed: failed.sort(), removed: gone, meta, checkedAt }
}

/** A data file from the device's saved copy (undefined if it hasn't been downloaded yet). */
export async function readDataFile<T>(path: string, db: MarketDataDB = marketDb()): Promise<T | undefined> {
  try {
    const row = await db.files.get(path)
    return row?.data as T | undefined
  } catch {
    return undefined
  }
}

/** The last meta.json saved on the device, and when the website was last reached. */
export async function readSavedMeta(db: MarketDataDB = marketDb()): Promise<{ meta: Meta; checkedAt: number } | undefined> {
  try {
    const row = await db.info.get('meta')
    return row ? { meta: row.meta, checkedAt: row.checkedAt } : undefined
  } catch {
    return undefined
  }
}

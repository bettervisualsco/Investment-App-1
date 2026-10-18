// When to check for new data: when the app opens, whenever it comes back to the screen, when the
// internet comes back, and when the user pulls to refresh. No background updates while closed.
// Other parts of the app subscribe here (e.g. Prediction mode recalculates when data changes).

import { readSavedMeta, syncData, type SyncOptions, type SyncResult } from './loader'
import type { Meta } from './types'

export interface DataState {
  /** checking = talking to the website right now */
  status: 'starting' | 'checking' | 'ready' | 'offline'
  meta: Meta | null
  /** When the website was last reached (ms), or null if never. */
  checkedAt: number | null
  last: SyncResult | null
  /** Goes up by one every time any data file changes, so screens know to reload. */
  version: number
}

type Listener = () => void
type ChangeListener = (changed: string[], meta: Meta) => void

let state: DataState = { status: 'starting', meta: null, checkedAt: null, last: null, version: 0 }
const listeners = new Set<Listener>()
const changeListeners = new Set<ChangeListener>()
let running: Promise<SyncResult> | null = null
let options: SyncOptions = {}

function set(patch: Partial<DataState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

export function getDataState(): DataState {
  return state
}

export function subscribeData(l: Listener): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** Called with the list of changed files after new data is saved (e.g. to re-run predictions). */
export function onDataChanged(l: ChangeListener): () => void {
  changeListeners.add(l)
  return () => changeListeners.delete(l)
}

/** Check for new data now (pull-to-refresh calls this). Several calls at once share one check. */
export function refreshData(): Promise<SyncResult> {
  running ??= (async () => {
    set({ status: 'checking' })
    try {
      const result = await syncData(options)
      const changedAnything = result.changed.length > 0
      set({
        status: result.status === 'offline' ? 'offline' : 'ready',
        meta: result.meta ?? state.meta,
        checkedAt: result.checkedAt,
        last: result,
        version: changedAnything ? state.version + 1 : state.version,
      })
      if (changedAnything && result.meta) changeListeners.forEach((l) => l(result.changed, result.meta as Meta))
      return result
    } finally {
      running = null
    }
  })()
  return running
}

const MIN_GAP_MS = 30_000
let started = false

/** Start keeping data fresh. Safe to call more than once. */
export function startDataSync(opts: SyncOptions = {}): void {
  if (started || typeof window === 'undefined') return
  started = true
  options = opts
  // Show the saved copy straight away, then check for news.
  void readSavedMeta(opts.db).then((saved) => {
    if (saved && !state.meta) set({ meta: saved.meta, checkedAt: saved.checkedAt })
    void refreshData()
  })
  const maybeRefresh = () => {
    if (document.visibilityState !== 'visible') return
    if (state.checkedAt && Date.now() - state.checkedAt < MIN_GAP_MS) return
    void refreshData()
  }
  document.addEventListener('visibilitychange', maybeRefresh)
  window.addEventListener('pageshow', maybeRefresh)
  window.addEventListener('online', () => void refreshData())
}

/** For tests only. */
export function resetDataSyncForTests(): void {
  state = { status: 'starting', meta: null, checkedAt: null, last: null, version: 0 }
  running = null
  started = false
  options = {}
  listeners.clear()
  changeListeners.clear()
}

export function configureDataSyncForTests(opts: SyncOptions): void {
  options = opts
}

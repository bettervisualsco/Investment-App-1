// The Markets tab's choices, remembered on this device (favourites, order, chart settings).
// A small store of its own in localStorage; if the browser won't save, the choices still work
// until the app is closed.

import { useSyncExternalStore } from 'react'
import type { RangeKey } from './maths'
import type { Horizon } from './predict'

export type SortKey = 'mine' | 'up' | 'down' | 'name'

export interface MarketPrefs {
  favourites: string[]
  /** The watchlist in the order the person chose (ids not listed go at the end). */
  order: string[]
  sort: SortKey
  /** Show the watchlist in groups (Australian shares, Global shares, ...). */
  grouped: boolean
  /** Groups the person has folded away. */
  collapsed: string[]
  range: RangeKey
  totalReturn: boolean
  inAud: boolean
  predictions: boolean
  horizon: Horizon
  compare: string[]
  compareRange: RangeKey
}

const KEY = 'markets-prefs-v1'

export const DEFAULT_PREFS: MarketPrefs = {
  favourites: [],
  order: [],
  sort: 'mine',
  grouped: true,
  collapsed: [],
  range: '1Y',
  totalReturn: false,
  inAud: true,
  predictions: false,
  horizon: 10,
  compare: ['VAS', 'VGS'],
  compareRange: '5Y',
}

function load(): MarketPrefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT_PREFS
    const saved = JSON.parse(raw) as Partial<MarketPrefs>
    return { ...DEFAULT_PREFS, ...(typeof saved === 'object' && saved ? saved : {}) }
  } catch {
    return DEFAULT_PREFS
  }
}

let prefs: MarketPrefs | null = null
const listeners = new Set<() => void>()

function get(): MarketPrefs {
  prefs ??= load()
  return prefs
}

export function setPrefs(patch: Partial<MarketPrefs> | ((p: MarketPrefs) => Partial<MarketPrefs>)): void {
  const cur = get()
  prefs = { ...cur, ...(typeof patch === 'function' ? patch(cur) : patch) }
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    // not remembered after closing, but still used now
  }
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function usePrefs(): [MarketPrefs, typeof setPrefs] {
  const p = useSyncExternalStore(subscribe, get, get)
  return [p, setPrefs]
}

/** Watchlist ids in the person's order: their saved order first, then any new ones. */
export function orderedIds(all: string[], order: string[]): string[] {
  const known = order.filter((id) => all.includes(id))
  return [...known, ...all.filter((id) => !known.includes(id))]
}

/** Swap two ids in the person's order (e.g. an ETF and the one shown just above it). */
export function swapIds(all: string[], order: string[], a: string, b: string): string[] {
  const list = orderedIds(all, order)
  const i = list.indexOf(a)
  const j = list.indexOf(b)
  if (i < 0 || j < 0) return list
  ;[list[i], list[j]] = [list[j], list[i]]
  return list
}

/**
 * Move `id` to just before (`side` 'before') or just after its neighbour in a shorter list the
 * person sees (a group, or the favourites), leaving everything else where it was. In a single list
 * of adjacent rows this is the same as swapping them; with groups, the ETFs between the two (from
 * other groups) don't get shuffled.
 */
export function moveIdNextTo(all: string[], order: string[], id: string, neighbour: string, side: 'before' | 'after'): string[] {
  const list = orderedIds(all, order).filter((x) => x !== id)
  const j = list.indexOf(neighbour)
  if (j < 0 || !all.includes(id)) return orderedIds(all, order)
  list.splice(side === 'before' ? j : j + 1, 0, id)
  return list
}

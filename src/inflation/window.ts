// Which stretch of history the inflation predictions (and the Planner's "Use historical average"
// button) learn from, and a tiny on-device store for that choice.

import { useSyncExternalStore } from 'react'
import { chainAverage, chainEnd, COUNTRY_NAME, CPI_SOURCE, type MonthlyChain } from './cpi'

export type WindowKey = 'rba' | 'full' | 'since1950' | 'since1990' | 'last20' | 'custom'

export interface WindowChoice {
  key: WindowKey
  /** Custom only: first and last calendar year. */
  from?: number
  to?: number
}

/** Default: since 1993, when Australia started targeting 2–3% inflation. */
export const DEFAULT_WINDOW: WindowChoice = { key: 'rba' }

export const WINDOW_OPTIONS: { value: WindowKey; label: string }[] = [
  { value: 'rba', label: 'Since 1993 (inflation targeting)' },
  { value: 'last20', label: 'Last 20 years' },
  { value: 'since1990', label: 'Since 1990' },
  { value: 'since1950', label: 'Since 1950' },
  { value: 'full', label: 'Full history' },
  { value: 'custom', label: 'Choose years…' },
]

/** The first and last month (month numbers, inclusive) of a window, clipped to the data. */
export function windowMonths(choice: WindowChoice, chain: MonthlyChain): { from: number; to: number } {
  const end = chainEnd(chain)
  let from = chain.start
  let to = end
  switch (choice.key) {
    case 'rba':
      from = 1993 * 12
      break
    case 'since1990':
      from = 1990 * 12
      break
    case 'since1950':
      from = 1950 * 12
      break
    case 'last20':
      from = end - 240 + 1
      break
    case 'custom':
      if (choice.from !== undefined) from = choice.from * 12
      if (choice.to !== undefined) to = choice.to * 12 + 11
      break
  }
  from = Math.max(from, chain.start)
  to = Math.min(to, end)
  // always keep at least 2 years to sample from
  if (to - from + 1 < 24) from = Math.max(chain.start, to - 23)
  return { from, to }
}

/** "1993–2026" */
export function windowYears(choice: WindowChoice, chain: MonthlyChain): string {
  const { from, to } = windowMonths(choice, chain)
  return `${Math.floor(from / 12)}–${Math.floor(to / 12)}`
}

/** For the Planner's button: the compound average over the window and a plain label. */
export function historicalAverage(chain: MonthlyChain, choice: WindowChoice): { rate: number; label: string } {
  const { from, to } = windowMonths(choice, chain)
  const avg = chainAverage(chain, from, to)
  return {
    rate: avg.yearly * 100,
    label: `${COUNTRY_NAME[chain.country]}, ${Math.floor(from / 12)}–${Math.floor(to / 12)} average (${CPI_SOURCE[chain.country]}, compounded). Change the years on the Inflation tab.`,
  }
}

// ---- remembered on this device ---------------------------------------------------------------

const KEY = 'inflation-window-v1'
const listeners = new Set<() => void>()
let current: WindowChoice = load()

function valid(x: unknown): x is WindowChoice {
  if (!x || typeof x !== 'object') return false
  const c = x as WindowChoice
  if (!WINDOW_OPTIONS.some((o) => o.value === c.key)) return false
  const okYear = (y: unknown) => y === undefined || (typeof y === 'number' && Number.isInteger(y) && y >= 1800 && y <= 2200)
  return okYear(c.from) && okYear(c.to)
}

function load(): WindowChoice {
  try {
    const raw = globalThis.localStorage?.getItem(KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    return valid(parsed) ? parsed : DEFAULT_WINDOW
  } catch {
    return DEFAULT_WINDOW
  }
}

export function getWindowChoice(): WindowChoice {
  return current
}

export function setWindowChoice(choice: WindowChoice): void {
  current = choice
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(choice))
  } catch {
    // private browsing or storage full: still works for this visit
  }
  listeners.forEach((l) => l())
}

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** The chosen history window, shared by the Inflation tab and the Planner's button. */
export function useWindowChoice(): [WindowChoice, (c: WindowChoice) => void] {
  return [useSyncExternalStore(subscribe, getWindowChoice, getWindowChoice), setWindowChoice]
}

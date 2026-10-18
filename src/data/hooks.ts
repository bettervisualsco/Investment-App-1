// React hooks for screens that show market data (Markets, Inflation, Settings, Planner).

import { useEffect, useState, useSyncExternalStore } from 'react'
import { freshnessLabel, isStale } from './freshness'
import { readDataFile } from './loader'
import { getDataState, subscribeData, type DataState } from './sync'

/** Overall data status: when it was last checked, whether we're offline, source health, etc. */
export function useDataState(): DataState {
  return useSyncExternalStore(subscribeData, getDataState, getDataState)
}

/** One data file, e.g. useDataFile<DailyFile>('daily/VAS.json'). Reloads when new data arrives. */
export function useDataFile<T>(path: string): { data: T | undefined; loading: boolean } {
  const { version } = useDataState()
  const [result, setResult] = useState<{ path: string; version: number; data: T | undefined } | null>(null)

  useEffect(() => {
    let cancelled = false
    readDataFile<T>(path).then((data) => {
      if (!cancelled) setResult({ path, version, data })
    })
    return () => {
      cancelled = true
    }
  }, [path, version])

  const current = result?.path === path ? result : null
  return { data: current?.data, loading: current === null || current.version !== version }
}

/** The "Prices as of 3:42pm · updated 6 min ago" label for a data file, plus warnings. */
export function useFreshness(path: string): { label: string; stale: boolean; offline: boolean } {
  const state = useDataState()
  const entry = state.meta?.files[path]
  // re-render every minute so "6 min ago" keeps counting
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])
  const at = new Date(now)
  return {
    label: freshnessLabel(entry?.asOf, entry?.updatedAt, at),
    stale: isStale(entry?.asOf, at),
    offline: state.status === 'offline',
  }
}

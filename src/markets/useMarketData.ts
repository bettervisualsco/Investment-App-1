// Reading the market data the Markets tab needs, through src/data (which keeps the device's copy
// up to date and reloads when new data arrives).

import { useEffect, useMemo, useState } from 'react'
import { decodeDaily, readDataFile, useDataFile, useDataState, useFreshness, type DailyFile, type DailyRows, type EtfInfo, type EtfsFile, type FxFile, type IndexInfo, type IntradayFile, type MarketKey } from '../data'
import type { Unit } from './format'
import type { Exchange } from './hours'
import { fxLookup } from './maths'

export type Item = (EtfInfo & { kind: 'etf' }) | IndexInfo

export function useEtfs(): { etfs: EtfInfo[]; indexes: IndexInfo[]; loading: boolean; byId: Map<string, Item> } {
  const { data, loading } = useDataFile<EtfsFile>('etfs.json')
  return useMemo(() => {
    const etfs = data?.etfs ?? []
    const indexes = data?.indexes ?? []
    const byId = new Map<string, Item>()
    etfs.forEach((e) => byId.set(e.id, { ...e, kind: 'etf' }))
    indexes.forEach((i) => byId.set(i.id, i))
    return { etfs, indexes, loading, byId }
  }, [data, loading])
}

export interface Daily {
  file: DailyFile
  rows: DailyRows
}

export function useDaily(id: string | null): { daily: Daily | undefined; loading: boolean } {
  const { data, loading } = useDataFile<DailyFile>(id ? `daily/${id}.json` : 'daily/none.json')
  const daily = useMemo(() => (data && id ? { file: data, rows: decodeDaily(data) } : undefined), [data, id])
  return { daily, loading }
}

export function useIntraday(market: MarketKey): IntradayFile | undefined {
  return useDataFile<IntradayFile>(`intraday/${market}.json`).data
}

/** US$ per A$1 on any date (daily rates since 2006, month-end rates before that). */
export function useFx(): { rate: ((date: string) => number | null) | null; loading: boolean } {
  const { daily, loading: l1 } = useDaily('AUDUSD')
  const { data: fx, loading: l2 } = useDataFile<FxFile>('fx.json')
  const rate = useMemo(() => (daily || fx ? fxLookup(daily?.rows, fx?.series.audusd_monthly) : null), [daily, fx])
  return { rate, loading: l1 || l2 }
}

export function intradayPath(market: MarketKey): string {
  return `intraday/${market}.json`
}

export function unitOf(item: Item | undefined, inAud = false): Unit {
  if (!item) return 'AUD'
  if (item.kind === 'index') return 'points'
  if (item.kind === 'fx') return 'fx'
  return inAud ? 'AUD' : item.currency
}

export function exchangeOf(market: MarketKey): Exchange {
  return market === 'us' ? 'nyse' : 'asx'
}

/** Re-render every minute (for "open/closed" and "6 min ago"). */
export function useMinute(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])
  return now
}

/** "Prices as of Fri 16 Oct close · updated 2 hours ago" for a market (5-minute prices if newer). */
export function useMarketFreshness(market: MarketKey) {
  const daily = useFreshness(market === 'us' ? 'daily/VOO.json' : 'daily/VAS.json')
  const intra = useFreshness(`intraday/${market}.json`)
  const { meta } = useDataState()
  const intraEntry = meta?.files[`intraday/${market}.json`]
  const dailyEntry = meta?.files[market === 'us' ? 'daily/VOO.json' : 'daily/VAS.json']
  const useIntra = !!intraEntry?.asOf && (!dailyEntry?.asOf || intraEntry.asOf.slice(0, 10) > dailyEntry.asOf)
  return useIntra ? intra : daily
}

/** Several daily files at once (the dashboard). Reloads when new data arrives. */
export function useDailyMany(ids: string[]): Map<string, Daily> {
  const { version } = useDataState()
  const key = ids.join(',')
  const [state, setState] = useState<{ key: string; version: number; map: Map<string, Daily> }>({ key: '', version: -1, map: new Map() })
  useEffect(() => {
    let cancelled = false
    const list = key ? key.split(',') : []
    Promise.all(list.map((id) => readDataFile<DailyFile>(`daily/${id}.json`))).then((files) => {
      if (cancelled) return
      const map = new Map<string, Daily>()
      files.forEach((f, i) => {
        if (f) map.set(list[i], { file: f, rows: decodeDaily(f) })
      })
      setState({ key, version, map })
    })
    return () => {
      cancelled = true
    }
  }, [key, version])
  return state.map
}

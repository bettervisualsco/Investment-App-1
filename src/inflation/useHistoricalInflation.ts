// For App.tsx: the Planner's "Use historical average" inflation button.

import { useMemo } from 'react'
import { useDataFile, type InflationFile } from '../data'
import type { HistoricalInflation } from '../planner/inflationHook'
import { monthlyChain } from './cpi'
import { historicalAverage, useWindowChoice } from './window'

/**
 * Australia's average yearly inflation (compounded) over the history window chosen on the
 * Inflation tab (default: since 1993, when inflation targeting began), with a plain label.
 * Null until the CPI data has loaded. Updates by itself when new CPI figures arrive.
 */
export function useHistoricalInflation(): HistoricalInflation | null {
  const { data } = useDataFile<InflationFile>('inflation.json')
  const [choice] = useWindowChoice()
  return useMemo(() => {
    if (!data) return null
    try {
      return historicalAverage(monthlyChain(data, 'au'), choice)
    } catch {
      return null
    }
  }, [data, choice])
}

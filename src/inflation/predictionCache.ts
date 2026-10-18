// Runs each inflation prediction once per data version and history window, and shares it between
// the fan chart and the buying-power calculator (so both always use the same simulated futures).

import { chainEnd, chainSlice, type MonthlyChain } from './cpi'
import { predictInflation, type InflationPrediction } from './predict'
import { windowMonths, type WindowChoice } from './window'

const cache = new WeakMap<MonthlyChain, Map<string, InflationPrediction>>()

export function windowKey(choice: WindowChoice): string {
  return choice.key === 'custom' ? `custom:${choice.from ?? ''}-${choice.to ?? ''}` : choice.key
}

export function getPrediction(chain: MonthlyChain, choice: WindowChoice): InflationPrediction {
  const key = windowKey(choice)
  let byWindow = cache.get(chain)
  if (!byWindow) cache.set(chain, (byWindow = new Map()))
  const hit = byWindow.get(key)
  if (hit) return hit
  const { from, to } = windowMonths(choice, chain)
  const end = chainEnd(chain)
  const pred = predictInflation({ history: chainSlice(chain, from, to), recent: chainSlice(chain, end - 11, end), seedKey: `${chain.country}|${key}` })
  byWindow.set(key, pred)
  return pred
}

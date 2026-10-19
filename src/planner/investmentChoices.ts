// Plain helpers for the investment pickers (no screen code, so the components' files only export components).

import type { SelectGroup } from '../components/inputs'
import type { EtfInfo, EtfsFile } from '../data'
import type { DistributionFrequency, Investment } from '../engine/types'

/** How often distributions are paid, for a drop-down. */
export const distFrequencyOptions: { value: DistributionFrequency; label: string }[] = [
  { value: 'monthly', label: 'Every month' },
  { value: 'quarterly', label: 'Every quarter' },
  { value: 'halfYearly', label: 'Every 6 months' },
  { value: 'yearly', label: 'Once a year (30 June)' },
]

/** The order ETF groups are listed in (others follow in the order they first appear). */
const CATEGORY_ORDER = ['Australian shares', 'Global shares', 'Currency-hedged', 'Diversified', 'Bonds', 'Gold', 'US-listed']

/** The group an ETF is shown in (data/etfs.json "category"), if the file has one. */
const categoryOf = (e: EtfInfo): string | undefined => {
  const c = (e as { category?: unknown }).category
  return typeof c === 'string' && c.trim() ? c : undefined
}

export interface EtfChoices {
  /** Every ETF in the watchlist, in file order. */
  all: { value: string; label: string }[]
  /** The same ETFs grouped by category, when data/etfs.json has categories (null = show a flat list). */
  groups: SelectGroup<string>[] | null
}

/** The watchlist ETFs for a drop-down, grouped by their category when the data has one. */
export function etfChoices(etfs: EtfsFile | undefined): EtfChoices {
  const list = etfs?.etfs ?? []
  const option = (e: EtfInfo) => ({ value: e.id, label: `${e.id}: ${e.name}${e.currency === 'USD' ? ' (US-listed)' : ''}` })
  const all = list.map(option)
  if (!list.some((e) => categoryOf(e))) return { all, groups: null }
  const byName = new Map<string, SelectGroup<string>>()
  for (const e of list) {
    const name = categoryOf(e) ?? 'Other'
    if (!byName.has(name)) byName.set(name, { label: name, options: [] })
    byName.get(name)!.options.push(option(e))
  }
  const rank = (name: string) => (CATEGORY_ORDER.includes(name) ? CATEGORY_ORDER.indexOf(name) : name === 'Other' ? 1000 : 500)
  const groups = [...byName.values()].sort((a, b) => rank(a.label) - rank(b.label))
  return { all, groups }
}


/** A short name for an investment, e.g. "VAS", "70% VGS / 30% VAS", "a savings account". */
export function investmentName(inv: Investment | undefined): string {
  if (!inv) return 'not chosen yet'
  if (inv.kind === 'etf') return inv.etf
  if (inv.kind === 'mix') return inv.parts.map((p) => `${Math.round(p.weight * 100) / 100}% ${p.etf}`).join(' / ')
  if (inv.kind === 'cash') return 'a savings account'
  return 'a custom asset'
}


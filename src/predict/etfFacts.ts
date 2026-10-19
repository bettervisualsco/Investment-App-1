// Filling in a phase's fee, yield and franking from the ETF facts in
// data/etfs.json when you pick what it's invested in. You can still edit them.

import type { EtfInfo, EtfsFile } from '../data'
import type { Currency, DistributionFrequency, HoldingDetails, Investment, Phase } from '../engine/types'

function frequencyOf(info: EtfInfo): DistributionFrequency {
  const text = (info.distributions?.value ?? '').toLowerCase()
  if (text.includes('month')) return 'monthly'
  if (text.includes('twice') || text.includes('half')) return 'halfYearly'
  if (text.includes('year') || text.includes('annual')) return 'yearly'
  return 'quarterly'
}

export interface FilledFacts {
  mer: number
  usListed: boolean
  yield: number
  frankedPct: number
  foreignPct: number
  frequency: DistributionFrequency
  /** Oldest "checked on" date of the facts used. */
  checkedOn: string | null
  /** Some facts weren't published or couldn't be confirmed. */
  gaps: string[]
}

/**
 * Roughly what % of an ASX-listed ETF's distributions is foreign income, from what it holds (its proxy series):
 * overseas shares and bonds pay foreign income, with foreign tax already taken off. Exact for single-region
 * funds (VGS, IVV, NDQ: 100%; VAS: 0%); an estimate for diversified ones (VDHG, DHHF), whose Australian
 * shares usually pay a bigger share of the distributions than their weight.
 */
export function foreignShareOf(info: { proxy?: { series: string; weight: number }[] }): number {
  const parts = info.proxy ?? []
  const total = parts.reduce((s, p) => s + p.weight, 0)
  if (total <= 0) return 0
  const foreign = parts.filter((p) => !p.series.startsWith('au_') && p.series !== 'cash_au').reduce((s, p) => s + p.weight, 0)
  return Math.round((foreign / total) * 1000) / 10
}

/** The facts for an ETF or a mix (weighted by each part's share). Null if an ETF isn't in the file. */
export function factsFor(inv: Investment, file: EtfsFile, currency: Currency): FilledFacts | null {
  const parts = inv.kind === 'etf' ? [{ etf: inv.etf, weight: 100 }] : inv.kind === 'mix' ? inv.parts : null
  if (!parts || parts.length === 0) return null
  const infos = parts.map((p) => file.etfs.find((e) => e.id === p.etf))
  if (infos.some((i) => !i)) return null
  const total = parts.reduce((s, p) => s + p.weight, 0) || 1
  let mer = 0
  let yieldPct = 0
  let franked = 0
  let foreign = 0
  let usWeight = 0
  const gaps: string[] = []
  const dates: string[] = []
  const freqs = new Set<DistributionFrequency>()
  parts.forEach((p, i) => {
    const info = infos[i]!
    const w = p.weight / total
    const y = info.yield?.value ?? 0
    const isUs = info.currency === 'USD'
    mer += w * (info.mer?.value ?? 0)
    yieldPct += w * y
    franked += w * y * (info.franking?.value ?? 0)
    const foreignShare = isUs ? 100 : foreignShareOf(info)
    foreign += w * y * foreignShare
    if (!isUs && foreignShare > 0 && foreignShare < 100) gaps.push(`${info.id} foreign income share (estimated from what it holds)`)
    if (isUs) usWeight += w
    freqs.add(frequencyOf(info))
    for (const f of [info.mer, info.yield, info.franking]) if (f) dates.push(f.checkedOn)
    if (!info.mer) gaps.push(`${info.id} fee`)
    if (!info.yield) gaps.push(`${info.id} yield`)
    if (info.franking?.value === null || info.franking?.value === undefined) gaps.push(`${info.id} franking`)
    for (const f of [info.mer, info.yield, info.franking]) if (f && f.verified === false) gaps.push(`${info.id} ${f === info.mer ? 'fee' : f === info.yield ? 'yield' : 'franking'} (estimate)`)
  })
  const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp
  const order: DistributionFrequency[] = ['monthly', 'quarterly', 'halfYearly', 'yearly']
  return {
    mer: round(mer, 3),
    // A$ plan + US-listed ETF (or a mix that is mostly US-listed): each buy and sale pays the currency fee.
    usListed: currency === 'AUD' && usWeight >= 0.5,
    yield: round(yieldPct, 2),
    frankedPct: yieldPct > 0 ? round(franked / yieldPct, 2) : 0,
    foreignPct: yieldPct > 0 ? round(foreign / yieldPct, 1) : 0,
    frequency: order.find((f) => freqs.has(f)) ?? 'quarterly',
    checkedOn: dates.length ? dates.sort()[0] : null,
    gaps,
  }
}

/** The phase with its investment set and, for an ETF or a mix, its fee and distribution details filled in. */
export function withInvestment(phase: Phase, inv: Investment, file: EtfsFile | undefined, currency: Currency): Phase {
  const next: Phase = { ...phase, investment: inv }
  if (inv.kind === 'custom' && phase.investment?.kind !== 'custom') next.mer = 0
  if (!file) return next
  const facts = factsFor(inv, file, currency)
  if (!facts) return next
  const before = phase.distribution
  return {
    ...next,
    mer: facts.mer,
    usListed: facts.usListed,
    distribution: {
      yield: facts.yield,
      frankedPct: facts.frankedPct,
      foreignPct: facts.foreignPct,
      foreignTaxPct: before?.foreignTaxPct ?? 15,
      frequency: facts.frequency,
    },
  }
}

/**
 * Money you have now: a holding (or the one amount) with its investment set. For an ETF or a mix, its fee, currency
 * fee and distributions are filled in from the ETF facts, as for a phase. Undefined = "Same as the first phase".
 */
export function holdingWithInvestment<T extends HoldingDetails>(h: T, inv: Investment | undefined, file: EtfsFile | undefined, currency: Currency): T {
  const next: T = { ...h, investment: inv }
  if (!inv) return next
  if (inv.kind === 'custom' && h.investment?.kind !== 'custom') next.mer = 0
  if (!file) return next
  const facts = factsFor(inv, file, currency)
  if (!facts) return next
  return {
    ...next,
    mer: facts.mer,
    usListed: facts.usListed,
    distribution: {
      yield: facts.yield,
      frankedPct: facts.frankedPct,
      foreignPct: facts.foreignPct,
      foreignTaxPct: h.distribution?.foreignTaxPct ?? 15,
      frequency: facts.frequency,
    },
  }
}

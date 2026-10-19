// Default settings for the Fees, Tax and Inflation switches. Every stage-4
// setting is optional in a saved plan, so older plans keep loading; anything
// missing is filled in from here.

import { ATO_TAX_YEARS } from './taxTables'
import type { DistributionSettings, FeeSettings, HoldingDetails, InflationSettings, Phase, Plan, TaxSettings, TaxYear } from './types'

export const DEFAULT_FEES: FeeSettings = {
  brokerage: { kind: 'flat', fee: 500 },
  buyFrequency: 'eachDeposit',
  cashRate: 0,
  fxFeePct: 0.5,
  platformFee: 0,
  platformFeePer: 'month',
  spreadPct: 0,
}

export const DEFAULT_TAX: TaxSettings = {
  basis: 'income',
  medicare: true,
  brackets: 'indexed',
  distributions: 'reinvest',
  atEnd: 'hold',
  owner: 'adult',
  minorMoney: 'family',
  cgtRules: 'law',
  cgtMinimum: true,
}

/** 2.5% a year: the middle of the Reserve Bank of Australia's 2–3% inflation target. A starting point, not a forecast. */
export const DEFAULT_INFLATION: InflationSettings = { rate: { kind: 'fixed', value: 2.5 } }

/** Example values for a broad share ETF. Change them to match your ETF (stage 2 will fill them from ETF info files). */
export const DEFAULT_DISTRIBUTION: DistributionSettings = {
  yield: 3,
  frankedPct: 30,
  foreignPct: 0,
  foreignTaxPct: 15,
  frequency: 'quarterly',
}

export const DEFAULT_MER = 0.2
export const DEFAULT_MARGINAL_RATE = 30

export interface ResolvedPhase {
  mer: number
  usListed: boolean
  distribution: DistributionSettings
  otherIncome: number
  marginalRate: number
  growWithInflation: boolean
  /** Buying and selling pays brokerage, spread and currency fees (Fees on). False for a cash/savings account. */
  tradingCosts: boolean
}

export interface ResolvedRealism {
  fees: boolean
  tax: boolean
  inflation: boolean
  feeSettings: FeeSettings
  taxSettings: TaxSettings
  inflationSettings: InflationSettings
  taxYears: TaxYear[]
  phases: ResolvedPhase[]
}

export function resolvePhase(phase: Phase): ResolvedPhase {
  const resolved: ResolvedPhase = {
    mer: phase.mer ?? DEFAULT_MER,
    usListed: phase.usListed ?? false,
    distribution: { ...DEFAULT_DISTRIBUTION, ...phase.distribution },
    otherIncome: phase.otherIncome ?? 0,
    marginalRate: phase.marginalRate ?? DEFAULT_MARGINAL_RATE,
    growWithInflation: phase.growWithInflation ?? false,
    tradingCosts: true,
  }
  if (phase.investment?.kind === 'cash') {
    // A savings account: no management fee or trading costs, and all of its return is interest,
    // paid monthly and taxed as income (Prediction mode replaces the yield with each month's real rate).
    resolved.mer = 0
    resolved.usListed = false
    resolved.tradingCosts = false
    resolved.distribution = { yield: phase.investment.rate, frankedPct: 0, foreignPct: 0, foreignTaxPct: 0, frequency: 'monthly' }
  }
  return resolved
}

/** A holding kept separately: its own fee, currency fee and distributions (the same defaults as a phase). */
export type ResolvedHolding = Pick<ResolvedPhase, 'mer' | 'usListed' | 'distribution' | 'tradingCosts'>

export function resolveHoldingSettings(h: HoldingDetails): ResolvedHolding {
  if (h.investment?.kind === 'cash') {
    // A savings account, as for a phase: no fees, and all of its return is interest paid monthly.
    return { mer: 0, usListed: false, tradingCosts: false, distribution: { yield: h.investment.rate, frankedPct: 0, foreignPct: 0, foreignTaxPct: 0, frequency: 'monthly' } }
  }
  return {
    mer: h.mer ?? DEFAULT_MER,
    usListed: h.usListed ?? false,
    distribution: { ...DEFAULT_DISTRIBUTION, ...h.distribution },
    tradingCosts: true,
  }
}

export function resolveRealism(plan: Plan): ResolvedRealism {
  const r = plan.realism
  const taxSettings = { ...DEFAULT_TAX, ...r?.taxSettings }
  return {
    fees: r?.fees ?? false,
    tax: r?.tax ?? false,
    inflation: r?.inflation ?? false,
    feeSettings: { ...DEFAULT_FEES, ...r?.feeSettings },
    taxSettings,
    inflationSettings: { ...DEFAULT_INFLATION, ...r?.inflationSettings },
    taxYears: taxSettings.tables && taxSettings.tables.length > 0 ? [...taxSettings.tables].sort((a, b) => a.fy - b.fy) : ATO_TAX_YEARS,
    phases: plan.phases.map(resolvePhase),
  }
}

// The shape of a plan. Plain data only, so it can be saved, exported, and
// read by a future native app.
//
// Units:
//   - Money is always whole cents (integers). $12.34 → 1234.
//   - Rates are percent per year. 7 → 7% per year.

import type { ISODate } from './dates'

export type DurationUnit = 'days' | 'weeks' | 'fortnights' | 'months' | 'years' | 'decades'

export interface Duration {
  count: number // whole number, >= 1 for phase lengths
  unit: DurationUnit
}

export type Frequency = 'none' | 'daily' | 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'yearly'

export type CurveShape = 'linear' | 'slowThenFast' | 'fastThenSlow'

/**
 * A value that can change during a phase (a deposit amount or a return rate).
 *
 * - fixed: the same all phase.
 * - ramp:  glides from `from` to `to` along a curve.
 * - steps: starts at `from` and jumps by `stepBy` every `every` (e.g. +$20 every 6 months).
 *
 * The change can happen over the whole phase or only part of it: it starts
 * `startAfter` into the phase and lasts `lasts` (if missing: to the phase end).
 * Before the window the value is `from`; after it, the value stays where it got to.
 */
export type Varying =
  | { kind: 'fixed'; value: number }
  | {
      kind: 'ramp'
      from: number
      to: number
      shape: CurveShape
      startAfter?: Duration
      lasts?: Duration
    }
  | {
      kind: 'steps'
      from: number
      stepBy: number
      every: Duration
      startAfter?: Duration
      lasts?: Duration
    }

export interface Phase {
  id: string
  name: string
  duration: Duration
  depositFrequency: Frequency
  /** Deposit per payment, in cents. */
  deposit: Varying
  /** Manual-mode return, % per year. This is the total return (price growth + distributions), before fees and tax. */
  returnRate: Varying

  // Stage 4: all optional, so plans saved before stage 4 still load. Missing → the defaults in defaults.ts.
  /** Fees switch: the fund's management fee (MER), % per year. */
  mer?: number
  /** Fees switch: the investment is listed in the US, so buying and selling pays the currency conversion fee. */
  usListed?: boolean
  /** Tax switch: how the investment pays distributions. */
  distribution?: DistributionSettings
  /** Tax switch (basis "income"): your other taxable income (job etc.), cents per year. */
  otherIncome?: number
  /** Tax switch (basis "rate"): your marginal tax rate, % (not counting the Medicare levy). */
  marginalRate?: number
  /** Inflation switch: deposits rise with inflation during this phase. */
  growWithInflation?: boolean

  // Stage 3: optional, so older plans still load.
  /** What this phase is invested in. Missing → not chosen (see Investment). */
  investment?: Investment
}

export type DistributionFrequency = 'monthly' | 'quarterly' | 'halfYearly' | 'yearly'

export interface DistributionSettings {
  /** Cash paid out each year as a % of the investment's value. Part of the return rate, not on top of it. */
  yield: number
  /** % of each distribution that is franked (carries Australian company tax already paid). */
  frankedPct: number
  /** % of each distribution that is foreign income (e.g. a US-listed ETF: 100). */
  foreignPct: number
  /** Foreign tax already taken out of the foreign part, % (15% for US dividends with a W-8BEN form). */
  foreignTaxPct: number
  frequency: DistributionFrequency
}

export interface OneOffEvent {
  id: string
  name: string
  date: ISODate
  /** Cents. Positive = money in, negative = money out. */
  amount: number
}

export interface Goal {
  amount: number // cents
  date: ISODate
}

export type Currency = 'AUD' | 'USD'

export interface Plan {
  id: string
  name: string
  startDate: ISODate
  startingBalance: number // cents
  currency: Currency
  phases: Phase[]
  events: OneOffEvent[]
  goal?: Goal
  /** Stage 4: the Fees, Tax and Inflation switches and their settings. Missing → all switches off. */
  realism?: Realism
  /** Stage 3: Manual or Prediction mode, and the prediction settings. Missing → Manual mode. */
  prediction?: PredictionSettings
  /**
   * "Money you have now": what the starting balance is invested in, what you paid for it and when you bought it.
   * Missing → today's behaviour: the starting balance is in the first phase's investment, bought on the start date
   * for its value.
   */
  startingMoney?: StartingMoney
}

// ---------------------------------------------------------------------------
// Money you have now (holdings at the start of the plan).

/**
 * The details of money you already have. Every field is optional; missing means today's behaviour.
 *
 * - investment: what it's in. Missing → "Same as the first phase" (it's simply part of the plan's investment).
 *   Something different from the first phase's investment is a separate holding (see StartingMoney.handling).
 * - costBase: what you paid for it, cents, including brokerage (for capital gains tax). Missing → today's value.
 * - boughtOn: roughly when you bought it. Missing → the plan's start date. Can't be after the start date.
 * - purchases: when you bought it in several goes. When present (one or more), these replace costBase and boughtOn:
 *   each purchase is its own tax lot with its own cost base and date.
 * - returnRate: Manual mode, % a year, for an ETF, mix or custom asset kept separately (cash uses its savings rate).
 *   Missing → 7%.
 * - mer / usListed / distribution: its own fee and distributions when kept separately. Missing → the defaults in
 *   defaults.ts (a cash holding has no fee and all of its return is interest).
 */
export interface HoldingDetails {
  investment?: Investment
  costBase?: number
  boughtOn?: ISODate
  purchases?: Purchase[]
  returnRate?: number
  mer?: number
  usListed?: boolean
  distribution?: DistributionSettings
}

/** One purchase of something you own now, e.g. "$2,000 of VGS in March 2023". */
export interface Purchase {
  id: string
  /** Roughly when (the app stores the 1st of the month). Can't be after the plan's start date. */
  boughtOn: ISODate
  /** What you paid, cents, including brokerage. */
  paid: number
  /**
   * This purchase's share of today's value, cents. The app estimates it from price history (an earlier purchase at a
   * lower price has grown more). Missing → shared in proportion to what you paid. The shares are scaled so they add
   * up to the holding's value.
   */
  value?: number
}

/** One thing you own now, e.g. "$8,000 of VGS bought in 2023". */
export interface Holding extends HoldingDetails {
  id: string
  /** Optional label, e.g. "Dad's shares". */
  name?: string
  /** Today's value, cents. */
  value: number
}

export interface StartingMoney {
  /**
   * How it's entered:
   * - "single": one amount (the plan's startingBalance) with the details in `single`.
   * - "holdings": a list of holdings. The starting balance is their total (the app keeps startingBalance equal to it).
   */
  entry: 'single' | 'holdings'
  single?: HoldingDetails
  holdings?: Holding[]
  /**
   * For holdings in something different from the first phase's investment:
   * - "keep" (default): each keeps its own investment, returns, fee and distributions for the whole plan.
   * - "move": sold on the start date and the money put into the first phase's investment (capital gains tax with
   *   Tax on; brokerage, spread and currency fees with Fees on).
   */
  handling?: 'keep' | 'move'
}

// ---------------------------------------------------------------------------
// Realism switches (stage 4). Each switch is independent.

export interface Realism {
  fees: boolean
  tax: boolean
  inflation: boolean
  /** Show the "all switches off" line next to the result. */
  showCost?: boolean
  feeSettings?: FeeSettings
  taxSettings?: TaxSettings
  inflationSettings?: InflationSettings
}

/** One price band of a tiered brokerage schedule: trades up to `upTo` cents (null = any size) cost `fee` cents + `pct`% of the trade. */
export interface BrokerageTier {
  upTo: number | null
  fee: number
  pct: number
}

export type Brokerage =
  | { kind: 'flat'; fee: number } // cents per trade
  | { kind: 'percent'; pct: number; min: number } // % of the trade, but at least `min` cents
  | { kind: 'tiered'; tiers: BrokerageTier[] }

/** How often waiting cash is actually invested. "eachDeposit" buys on every day money comes in. */
export type BuyFrequency = 'eachDeposit' | Exclude<Frequency, 'none'>

export interface FeeSettings {
  brokerage: Brokerage
  /** Which preset the brokerage came from, if any (just a label). */
  brokeragePreset?: string
  buyFrequency: BuyFrequency
  /** % per year earned by cash waiting to be invested. */
  cashRate: number
  /** Currency conversion fee, % of each trade, for US-listed investments. */
  fxFeePct: number
  /** Account / platform fee, cents. */
  platformFee: number
  platformFeePer: 'month' | 'year'
  /** Buy/sell spread, % of each trade. */
  spreadPct: number
}

export interface TaxSettings {
  /** Work out tax from your other income (uses the tax brackets), or from a marginal rate you pick. */
  basis: 'income' | 'rate'
  medicare: boolean
  /** "fixed": brackets stay as they are (bracket creep). "indexed": brackets rise with inflation. */
  brackets: 'fixed' | 'indexed'
  distributions: 'reinvest' | 'cash'
  /** At the end of the plan: sell everything and pay the tax, or keep it and just show the tax you'd owe. */
  atEnd: 'sell' | 'hold'
  owner: 'adult' | 'minor'
  /** For owner "minor": their 18th birthday. Under-18 rules apply to financial years ending before it. */
  turns18On?: ISODate
  /** For owner "minor": money from family/gifts (special under-18 rates) or from their own job (normal rates). */
  minorMoney: 'family' | 'own'
  /**
   * Capital gains rules. "law": the 50% discount until 30 June 2027, then cost base indexation (and the
   * minimum tax, if `cgtMinimum`) for gains from 1 July 2027, as now legislated. "discount": keep the 50% discount for ever.
   */
  cgtRules: 'law' | 'discount'
  /** Apply the minimum 30% tax on net capital gains from 1 July 2027 (rules "law" only). */
  cgtMinimum: boolean
  /** Your edited copy of the tax tables. Missing → the built-in ATO tables. */
  tables?: TaxYear[]
}

/** Tax rules for one financial year. Money is in whole dollars here, the way the ATO writes it. */
export interface TaxYear {
  /** Financial year, named by the year it ends (2027 = 2026–27). */
  fy: number
  /** Each bracket starts above `over` dollars and taxes every dollar above that at `rate`%. First one starts at 0. */
  brackets: { over: number; rate: number }[]
  medicare: { rate: number; lowerThreshold: number; upperThreshold: number; shadeInRate: number }
  lito: { max: number; taper1From: number; taper1Rate: number; taper2From: number; taper2Rate: number; cutOut: number }
  /** Under-18s' investment ("eligible") income: nil up to `nilUpTo`, then `shadeRate`% of the excess, and above `fullFrom` `fullRate`% of the whole amount. */
  minor: { nilUpTo: number; shadeRate: number; fullFrom: number; fullRate: number }
}

export interface InflationSettings {
  /** % per year. Fixed, a ramp or steps over the whole plan. */
  rate: Varying
}

// ---------------------------------------------------------------------------
// What each phase is invested in, and Prediction mode (stage 3).

/** One part of a custom mix: an ETF from the watchlist and its share, %. */
export interface MixPart {
  etf: string
  weight: number
}

/** A made-up investment described by its average return and bumpiness. */
export interface CustomAsset {
  kind: 'custom'
  /** Long-run average yearly growth, % (compound, before fees). The middle outcome grows at about this rate. */
  mean: number
  /** Volatility: how far a typical year's return strays from the average (standard deviation of yearly returns), %. */
  volatility: number
  /** Optional sudden crashes: on average once every `everyYears` years, the value falls about `drop`% in one month. */
  crashes?: { everyYears: number; drop: number }
}

/**
 * What a phase is invested in. Missing (plans made before stage 3) → nothing chosen: Manual
 * mode uses the phase's return rate exactly as before, and Prediction mode asks you to choose.
 *
 * - etf:    one ETF from the watchlist (data/etfs.json), e.g. "VAS".
 * - mix:    several ETFs, e.g. 70% VGS / 30% VAS, put back to these shares once a year.
 * - cash:   a savings account. Manual mode: `rate` % a year. Prediction mode: the RBA cash rate history.
 * - custom: an investment you describe (CustomAsset).
 *
 * In Manual mode ETF, mix and custom phases grow at the phase's return rate.
 */
export type Investment = { kind: 'etf'; etf: string } | { kind: 'mix'; parts: MixPart[] } | { kind: 'cash'; rate: number } | CustomAsset

export type HistoryWindowKind = 'full' | 'since1950' | 'since1990' | 'last20' | 'custom'

export interface PredictionSettings {
  mode: 'manual' | 'prediction'
  /** Which part of history to replay. Default "full". */
  window?: HistoryWindowKind
  /** For window "custom": first and last calendar year (inclusive). */
  windowFrom?: number
  windowTo?: number
  /** Length of each chunk of real history, months. Default 12. */
  blockMonths?: number
  /** Number of simulations. Missing → the default from Settings. */
  runs?: number
  /** Worst, likely, best percentiles. Missing → the default from Settings. */
  percentiles?: [number, number, number]
  /** Random seed. Missing → the seed from Settings. "Re-roll" sets a new one. */
  seed?: number
  /** Draw a few individual simulations on the chart. */
  showPaths?: boolean
}

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
  /** Manual-mode return, % per year. */
  returnRate: Varying
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
}

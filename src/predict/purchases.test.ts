import { describe, expect, it } from 'vitest'
import type { DailyRows } from '../data'
import { holdingPurchases } from '../engine/holdings'
import { closeOnOrBefore, estimatePurchaseValues } from './purchases'

const rows = (pairs: [string, number][]): DailyRows => ({ dates: pairs.map((p) => p[0]), close: pairs.map((p) => p[1]), adj: pairs.map((p) => p[1]) })

// A made-up ETF: $50 in mid-2024, $80 in mid-2025, $100 today.
const AAA = rows([
  ['2024-06-14', 50],
  ['2025-06-13', 80],
  ['2026-10-16', 100],
])
// A second one that didn't move.
const BBB = rows([
  ['2024-06-14', 20],
  ['2025-06-13', 20],
  ['2026-10-16', 20],
])
const lookup = (etf: string) => ({ AAA, BBB })[etf as 'AAA' | 'BBB']

describe('splitting today’s value between purchases', () => {
  it('finds the close on or before a date', () => {
    expect(closeOnOrBefore(AAA, '2025-06-15')).toBe(80)
    expect(closeOnOrBefore(AAA, '2024-06-01')).toBeNull()
  })

  it('one ETF: by units bought (paid ÷ price then)', () => {
    // $1,000 at $50 = 20 units; $1,000 at $80 = 12.5 units. 32.5 units now worth $3,250.
    const v = estimatePurchaseValues(
      { kind: 'etf', etf: 'AAA' },
      [
        { id: 'a', boughtOn: '2024-06-01', paid: 100_000 },
        { id: 'b', boughtOn: '2025-06-01', paid: 100_000 },
      ],
      325_000,
      lookup,
    )
    expect(v).toEqual([200_000, 125_000])
  })

  it('a mix: each purchase split across its ETFs by their shares', () => {
    // 50/50 AAA/BBB. Purchase 1 ($1,000 in 2024): AAA part grew 2×, BBB part 1× → weight 1,000 × 1.5.
    // Purchase 2 ($1,000 in 2025): AAA 1.25×, BBB 1× → weight 1,000 × 1.125. Total today $2,625.
    const v = estimatePurchaseValues(
      { kind: 'mix', parts: [{ etf: 'AAA', weight: 50 }, { etf: 'BBB', weight: 50 }] },
      [
        { id: 'a', boughtOn: '2024-06-01', paid: 100_000 },
        { id: 'b', boughtOn: '2025-06-01', paid: 100_000 },
      ],
      262_500,
      lookup,
    )
    expect(v).toEqual([150_000, 112_500])
  })

  it('can’t estimate a savings account, a single purchase, or a date before the price history', () => {
    const two = [
      { id: 'a', boughtOn: '2020-01-01', paid: 100_000 },
      { id: 'b', boughtOn: '2025-06-01', paid: 100_000 },
    ]
    expect(estimatePurchaseValues({ kind: 'cash', rate: 4 }, two, 200_000, lookup)).toBeNull()
    expect(estimatePurchaseValues({ kind: 'etf', etf: 'AAA' }, two.slice(1), 100_000, lookup)).toBeNull()
    expect(estimatePurchaseValues({ kind: 'etf', etf: 'AAA' }, two, 200_000, lookup)).toBeNull() // 2020 is before AAA's data
  })

  it('the engine scales the estimates to the holding’s value, or shares by what was paid without them', () => {
    const h = {
      value: 300_000,
      purchases: [
        { id: 'b', boughtOn: '2025-06-01', paid: 100_000, value: 100_000 },
        { id: 'a', boughtOn: '2024-06-01', paid: 100_000, value: 200_000 },
      ],
    }
    // Oldest first, each keeping its own cost base.
    expect(holdingPurchases(h)).toEqual([
      { boughtOn: '2024-06-01', cost: 100_000, value: 200_000 },
      { boughtOn: '2025-06-01', cost: 100_000, value: 100_000 },
    ])
    const noEstimates = { value: 300_000, purchases: [{ id: 'a', boughtOn: '2024-06-01', paid: 100_000 }, { id: 'b', boughtOn: '2025-06-01', paid: 200_000 }] }
    expect(holdingPurchases(noEstimates).map((p) => p.value)).toEqual([100_000, 200_000])
  })
})

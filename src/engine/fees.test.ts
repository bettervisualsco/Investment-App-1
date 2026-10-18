import { describe, expect, it } from 'vitest'
import { brokerageFor, grossForNet, saleCosts } from './fees'
import type { Brokerage } from './types'

const tiered: Brokerage = {
  kind: 'tiered',
  tiers: [
    { upTo: 100_000, fee: 500, pct: 0 },
    { upTo: 300_000, fee: 1_000, pct: 0 },
    { upTo: 1_000_000, fee: 1_995, pct: 0 },
    { upTo: 2_500_000, fee: 2_995, pct: 0 },
    { upTo: null, fee: 0, pct: 0.12 },
  ],
}

describe('brokerage', () => {
  it('flat: the same fee on every trade, but never more than the trade', () => {
    expect(brokerageFor({ kind: 'flat', fee: 500 }, 10_000)).toBe(500)
    expect(brokerageFor({ kind: 'flat', fee: 500 }, 300)).toBe(300)
    expect(brokerageFor({ kind: 'flat', fee: 500 }, 0)).toBe(0)
  })

  it('percent with a minimum: 0.1%, at least $11', () => {
    const b: Brokerage = { kind: 'percent', pct: 0.1, min: 1_100 }
    expect(brokerageFor(b, 500_000)).toBe(1_100) // 0.1% of $5,000 = $5 → minimum $11
    expect(brokerageFor(b, 2_000_000)).toBe(2_000) // 0.1% of $20,000 = $20
  })

  it('tiered: $5 to $1,000, $10 to $3,000, $19.95 to $10,000, $29.95 to $25,000, then 0.12%', () => {
    expect(brokerageFor(tiered, 100_000)).toBe(500)
    expect(brokerageFor(tiered, 100_001)).toBe(1_000)
    expect(brokerageFor(tiered, 500_000)).toBe(1_995)
    expect(brokerageFor(tiered, 2_500_000)).toBe(2_995)
    expect(brokerageFor(tiered, 3_000_000)).toBeCloseTo(3_600, 6) // 0.12% of $30,000 = $36
  })
})

describe('selling to get a set amount of cash', () => {
  it('sale costs: 0.1% spread, then 0.5% currency fee, then $5 brokerage', () => {
    const c = saleCosts(100_000, { kind: 'flat', fee: 500 }, 0.1, 0.5)
    expect(c.spread).toBeCloseTo(100, 6)
    expect(c.fx).toBeCloseTo(499.5, 6)
    expect(c.net).toBeCloseTo(100_000 - 100 - 499.5 - 500, 6)
  })

  it('finds the sale size that leaves exactly the cash wanted, even across a brokerage tier', () => {
    for (const wanted of [50_000, 99_600, 99_700, 250_000, 5_000_000]) {
      const gross = grossForNet(wanted, tiered, 0.05, 0.6)
      const net = saleCosts(gross, tiered, 0.05, 0.6).net
      expect(net).toBeGreaterThanOrEqual(wanted - 1e-6)
      expect(net - wanted).toBeLessThan(600) // never a big overshoot (at most one tier step)
    }
  })

  it('with no costs, you sell exactly what you want', () => {
    expect(grossForNet(12_345, null, 0, 0)).toBe(12_345)
  })
})

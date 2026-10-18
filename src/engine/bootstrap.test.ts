import { describe, expect, it } from 'vitest'
import { blockBootstrap, countRuns, fanBands, hashSeed, makeRng, maxDrawdown, percentileOfSorted } from './bootstrap'

describe('random numbers', () => {
  it('the same seed always gives the same numbers, a different seed different ones', () => {
    const a = makeRng(42)
    const b = makeRng(42)
    const c = makeRng(43)
    const xs = Array.from({ length: 5 }, () => a())
    expect(Array.from({ length: 5 }, () => b())).toEqual(xs)
    expect(Array.from({ length: 5 }, () => c())).not.toEqual(xs)
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true)
  })

  it('looks evenly spread (mean ≈ 0.5 over 100,000 draws)', () => {
    const rng = makeRng(1)
    let sum = 0
    for (let i = 0; i < 100_000; i++) sum += rng()
    expect(sum / 100_000).toBeCloseTo(0.5, 2)
  })

  it('hashSeed is stable and depends on every part', () => {
    expect(hashSeed('VAS', 2000)).toBe(hashSeed('VAS', 2000))
    expect(hashSeed('VAS', 2000)).not.toBe(hashSeed('VGS', 2000))
    expect(hashSeed('VAS', 2000)).not.toBe(hashSeed('VAS', 2001))
  })
})

describe('block bootstrap', () => {
  it('is repeatable with the same seed', () => {
    const opts = { historyLength: 600, months: 240, runs: 50, seed: 7 }
    expect(blockBootstrap(opts)).toEqual(blockBootstrap(opts))
    expect(blockBootstrap({ ...opts, seed: 8 })).not.toEqual(blockBootstrap(opts))
  })

  it('keeps real months in order inside each 12-month block (wrapping round the end of history)', () => {
    const n = 100
    const idx = blockBootstrap({ historyLength: n, months: 120, runs: 20, seed: 3 })
    for (let r = 0; r < 20; r++) {
      for (let k = 0; k < 120; k++) {
        const v = idx[r * 120 + k]
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThan(n)
        if (k % 12 !== 0) expect(v).toBe((idx[r * 120 + k - 1] + 1) % n)
      }
    }
  })

  it('a partial last block is cut short, not skipped', () => {
    const idx = blockBootstrap({ historyLength: 50, months: 30, runs: 1, seed: 1, blockMonths: 12 })
    expect(idx).toHaveLength(30)
    expect(idx[25]).toBe((idx[24] + 1) % 50)
  })

  it('every month of history is about equally likely, including the most recent ones', () => {
    const n = 60
    const idx = blockBootstrap({ historyLength: n, months: 120, runs: 2000, seed: 11 })
    const counts = new Array(n).fill(0)
    idx.forEach((v) => counts[v]++)
    const expected = idx.length / n
    for (const c of counts) expect(Math.abs(c - expected) / expected).toBeLessThan(0.1)
  })

  it('handles block longer than history, block of 1, and empty requests', () => {
    expect(Array.from(blockBootstrap({ historyLength: 5, months: 12, runs: 1, seed: 1, blockMonths: 50 })).every((v) => v >= 0 && v < 5)).toBe(true)
    expect(blockBootstrap({ historyLength: 5, months: 0, runs: 3, seed: 1 })).toHaveLength(0)
    expect(blockBootstrap({ historyLength: 5, months: 4, runs: 2, seed: 1, blockMonths: 1 })).toHaveLength(8)
    expect(() => blockBootstrap({ historyLength: 0, months: 4, runs: 1, seed: 1 })).toThrow()
  })
})

describe('percentiles and fans', () => {
  it('matches hand-worked percentiles', () => {
    const s = [10, 20, 30, 40, 50]
    expect(percentileOfSorted(s, 0)).toBe(10)
    expect(percentileOfSorted(s, 50)).toBe(30)
    expect(percentileOfSorted(s, 100)).toBe(50)
    expect(percentileOfSorted(s, 10)).toBeCloseTo(14) // position 0.4 → 10 + 0.4 × 10
    expect(percentileOfSorted(s, 90)).toBeCloseTo(46)
    expect(percentileOfSorted([], 50)).toBeNaN()
  })

  it('builds worst / likely / best lines point by point', () => {
    // 5 runs × 2 points. Point 0 values 1..5, point 1 values 10..50 (shuffled).
    const values = [3, 30, 1, 50, 5, 10, 2, 40, 4, 20]
    const [p10, p50, p90] = fanBands(values, 5, 2, [10, 50, 90])
    expect(Array.from(p50)).toEqual([3, 30])
    expect(p10[0]).toBeCloseTo(1.4)
    expect(p90[1]).toBeCloseTo(46)
  })
})

describe('drawdown and counting', () => {
  it('finds the biggest fall from a peak', () => {
    expect(maxDrawdown([100, 120, 90, 130, 65, 140])).toBeCloseTo(0.5) // 130 → 65
    expect(maxDrawdown([1, 2, 3])).toBe(0)
    expect(maxDrawdown([])).toBe(0)
  })

  it('counts runs that pass a test', () => {
    expect(countRuns(4, (r) => r % 2 === 0)).toEqual({ count: 2, share: 0.5 })
    expect(countRuns(0, () => true)).toEqual({ count: 0, share: 0 })
  })
})

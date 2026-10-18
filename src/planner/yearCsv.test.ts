import { describe, expect, it } from 'vitest'
import { runManual } from '../engine/manual'
import type { Plan } from '../engine/types'
import { yearTableCsv } from './yearCsv'

const plan = (realism?: Plan['realism']): Plan => ({
  id: 'p',
  name: 'CSV test',
  startDate: '2026-07-01',
  startingBalance: 1_000_000,
  currency: 'AUD',
  phases: [{ id: 'a', name: 'A', duration: { count: 2, unit: 'years' }, depositFrequency: 'monthly', deposit: { kind: 'fixed', value: 10_000 }, returnRate: { kind: 'fixed', value: 7 } }],
  events: [],
  realism,
})

describe('year-by-year CSV', () => {
  it('has the stage-1 columns when every switch is off', () => {
    const csv = yearTableCsv(runManual(plan()), 'CSV test')
    expect(csv).toContain('Financial year,From,To,Opening balance,Put in,Taken out,Growth,Closing balance')
    expect(csv).toContain('switches all off')
    expect(csv.split('\n').find((l) => l.startsWith('Financial year'))).not.toContain('Fees')
  })

  it('adds fees, tax and today’s-dollars columns for the switches that are on', () => {
    const csv = yearTableCsv(runManual(plan({ fees: true, tax: true, inflation: true })), 'CSV test')
    const header = csv.split('\n').find((l) => l.startsWith('Financial year'))!
    expect(header).toContain('Fees')
    expect(header).toContain('Tax (negative = refund)')
    expect(header).toContain('Closing (today’s $)')
    const rows = csv.split('\n').slice(csv.split('\n').indexOf(header) + 1)
    expect(rows).toHaveLength(2)
    expect(rows[0].split(',')).toHaveLength(header.split(',').length)
  })
})

import { describe, expect, it } from 'vitest'
import etfsRaw from '../../data/etfs.json?raw'
import type { EtfsFile } from '../data'
import type { Plan } from '../engine/types'
import { factsFor } from './etfFacts'
import { applyHistoryWindow } from './fromMarkets'

const etfs = JSON.parse(etfsRaw) as EtfsFile

const plan: Plan = {
  id: 'p',
  name: 'Test',
  startDate: '2026-10-18',
  startingBalance: 0,
  currency: 'AUD',
  phases: [
    { id: 'a', name: 'Uni', duration: { count: 4, unit: 'years' }, depositFrequency: 'weekly', deposit: { kind: 'fixed', value: 5_000 }, returnRate: { kind: 'fixed', value: 7 } },
    { id: 'b', name: 'Job', duration: { count: 10, unit: 'years' }, depositFrequency: 'monthly', deposit: { kind: 'fixed', value: 50_000 }, returnRate: { kind: 'fixed', value: 7 } },
  ],
  events: [],
}

const req = { phaseId: 'b', etfId: 'VGS', from: '2010-03-03', to: '2020-06-14', fromMonth: '2010-03', toMonth: '2020-06', inAud: false }

describe('Markets → Planner history window', () => {
  it('invests the chosen phase in the ETF, fills its facts, and replays those calendar years', () => {
    const { plan: next, message } = applyHistoryWindow(plan, req, etfs)
    expect(next.phases[1].investment).toEqual({ kind: 'etf', etf: 'VGS' })
    const facts = factsFor({ kind: 'etf', etf: 'VGS' }, etfs, 'AUD')
    expect(facts).not.toBeNull()
    expect(next.phases[1].mer).toBe(facts!.mer)
    expect(next.phases[1].distribution?.frankedPct).toBe(facts!.frankedPct)
    expect(next.phases[0]).toEqual(plan.phases[0])
    expect(next.prediction).toMatchObject({ mode: 'prediction', window: 'custom', windowFrom: 2010, windowTo: 2020 })
    expect(message).toMatch(/Job/)
    expect(message).toMatch(/2010 to 2020/)
    expect(message).toMatch(/whole calendar years/)
  })

  it('keeps other prediction settings the plan already had', () => {
    const withSeed: Plan = { ...plan, prediction: { mode: 'manual', seed: 99, runs: 1000 } }
    expect(applyHistoryWindow(withSeed, req, etfs).plan.prediction).toMatchObject({ seed: 99, runs: 1000, mode: 'prediction' })
  })

  it('changes nothing if the phase has been deleted', () => {
    const r = applyHistoryWindow(plan, { ...req, phaseId: 'gone' }, etfs)
    expect(r.plan).toBe(plan)
    expect(r.message).toMatch(/nothing was changed/)
  })
})

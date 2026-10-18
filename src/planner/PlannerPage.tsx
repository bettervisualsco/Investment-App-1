import { useDeferredValue, useMemo, useState } from 'react'
import { InfoTip } from '../components/InfoTip'
import { Field, MoneyInput, Segmented } from '../components/inputs'
import { dayToISO } from '../engine/dates'
import { resolveRealism } from '../engine/defaults'
import { runCostComparison, runManual } from '../engine/manual'
import type { Plan } from '../engine/types'
import { validatePlan } from '../engine/validate'
import { EventsSection, GoalSection } from './EventsAndGoal'
import type { HistoricalInflation } from './inflationHook'
import { PhaseList } from './PhaseList'
import { RealismSettings, RealismSwitches } from './RealismPanel'
import { realismOf } from './realismView'
import { ResultsHero, YearTable } from './Results'

export function PlannerPage({
  plan,
  setPlan,
  historicalInflation = null,
}: {
  plan: Plan
  setPlan: (p: Plan) => void
  /** Average inflation from the CPI history (stage 2 data), for the "Use historical average" button. */
  historicalInflation?: HistoricalInflation | null
}) {
  const [openPhase, setOpenPhase] = useState<string | null>(null)
  const deferredPlan = useDeferredValue(plan)
  const realism = realismOf(plan)
  const taxBasis = resolveRealism(plan).taxSettings.basis

  const problems = useMemo(() => validatePlan(deferredPlan), [deferredPlan])
  const { result, comparison } = useMemo(() => {
    if (problems.length > 0) return { result: null, comparison: null }
    const r = realismOf(deferredPlan)
    if (r.showCost && (r.fees || r.tax || r.inflation)) {
      const cmp = runCostComparison(deferredPlan)
      return { result: cmp.actual, comparison: cmp }
    }
    return { result: runManual(deferredPlan), comparison: null }
  }, [deferredPlan, problems])
  const planProblems = problems.filter((p) => p.where === 'plan' || p.where === 'goal')

  const midDate = result ? dayToISO(Math.round((result.startDay + result.endDay) / 2)) : plan.startDate
  const goalDefault = result ? dayToISO(result.endDay - 1) : plan.startDate

  const pickPhase = (id: string) => {
    setOpenPhase(id)
    requestAnimationFrame(() => document.getElementById(`phase-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  return (
    <div className="planner">
      <header className="planner-head">
        <div className="mode-row">
          <Segmented
            label="Mode"
            value="manual"
            onChange={() => {}}
            options={[
              { value: 'manual', label: 'Manual' },
              { value: 'prediction', label: 'Prediction (soon)', disabled: true },
            ]}
          />
          <InfoTip term="manualMode" />
        </div>
        <input className="plan-name" aria-label="Plan name" value={plan.name} onChange={(e) => setPlan({ ...plan, name: e.target.value })} />
        <div className="basics">
          <Field label="Start date" htmlFor="plan-start">
            <input
              id="plan-start"
              type="date"
              className="input-text input-date"
              value={plan.startDate}
              onChange={(e) => e.target.value && setPlan({ ...plan, startDate: e.target.value })}
            />
          </Field>
          <Field label="Starting balance" htmlFor="plan-balance">
            <MoneyInput id="plan-balance" label="Starting balance" currency={plan.currency} value={plan.startingBalance} onChange={(startingBalance) => setPlan({ ...plan, startingBalance })} />
          </Field>
          <Field label="Currency">
            <Segmented
              label="Currency"
              value={plan.currency}
              onChange={(currency) => setPlan({ ...plan, currency })}
              options={[
                { value: 'AUD', label: 'AUD' },
                { value: 'USD', label: 'USD' },
              ]}
            />
          </Field>
        </div>
        <RealismSwitches plan={plan} setPlan={setPlan} />
        {planProblems.length > 0 && (
          <ul className="problems">
            {planProblems.map((p, i) => (
              <li key={i}>{p.message}</li>
            ))}
          </ul>
        )}
      </header>

      <div className="planner-results">
        {result ? (
          <>
            <ResultsHero result={result} comparison={comparison} phases={plan.phases} currency={plan.currency} realism={realism} onPickPhase={pickPhase} />
            <YearTable result={result} currency={plan.currency} planName={plan.name} />
          </>
        ) : (
          <section className="results results-empty">
            <p className="hero-lead">Fix the highlighted {problems.length === 1 ? 'item' : 'items'} to see your results.</p>
            <ul className="problems">
              {problems.map((p, i) => (
                <li key={i}>{p.message}</li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <div className="planner-editor">
        <RealismSettings plan={plan} setPlan={setPlan} historicalInflation={historicalInflation} />
        <PhaseList
          phases={plan.phases}
          summaries={result?.phases ?? null}
          problems={problems}
          currency={plan.currency}
          realism={realism}
          taxBasis={taxBasis}
          openId={openPhase}
          setOpenId={setOpenPhase}
          onChange={(phases) => setPlan({ ...plan, phases })}
        />
        <EventsSection events={plan.events} currency={plan.currency} defaultDate={midDate} problems={problems} onChange={(events) => setPlan({ ...plan, events })} />
        <GoalSection goal={plan.goal} currency={plan.currency} defaultDate={goalDefault} onChange={(goal) => setPlan({ ...plan, goal })} />
      </div>
    </div>
  )
}

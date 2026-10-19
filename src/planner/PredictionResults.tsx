import { useState } from 'react'
import { InfoTip } from '../components/InfoTip'
import { useDataFile, type EtfsFile } from '../data'
import type { Plan } from '../engine/types'
import { dateLong, dateMonthYear, money, yearOf } from '../lib/format'
import { withInvestment } from '../predict/etfFacts'
import { HelpTip } from '../predict/HelpTip'
import { monthText } from '../predict/history'
import { newSeed, withPrediction } from '../predict/settingsStore'
import type { PredictionState } from '../predict/usePrediction'
import { FanChart } from './FanChart'
import { EtfSelect } from './InvestmentPicker'
import { etfChoices } from './investmentChoices'
import { viewOf } from './realismView'
import { Breakdown, CostPanel, EndSaleNote } from './Results'
import { Toggle } from './RealismPanel'
import { percentileLabels } from './words'
import './prediction.css'

/** A warning's wording without its amounts and dates. */
const kindOf = (w: string) => w.replace(/\$[\d,.]+/g, '$').replace(/\d+/g, '#')
const count = (n: number) => n.toLocaleString('en-AU')
const pct = (share: number) => {
  const p = share * 100
  if (p > 0 && p < 1) return 'under 1%'
  if (p < 100 && p > 99) return 'over 99%'
  return `${Math.round(p)}%`
}

export function PredictionResults({
  state,
  plan,
  setPlan,
  onPickPhase,
}: {
  state: PredictionState
  plan: Plan
  setPlan: (p: Plan) => void
  onPickPhase: (id: string) => void
}) {
  const { result, settings } = state
  const currency = plan.currency

  if (!result) {
    return (
      <section className="results predict-results" aria-labelledby="predict-title">
        <div className="hero-lead" id="predict-title">
          Prediction mode <HelpTip term="predictionMode" />
        </div>
        <StatusLine state={state} />
        {state.status === 'blocked' && <Blockers state={state} plan={plan} setPlan={setPlan} />}
      </section>
    )
  }

  const d = result.median.detail
  const v = viewOf(d)
  const labels = percentileLabels(result.percentiles)
  const sold = d.endSale?.mode === 'sell'
  const end = dateLong(result.endDay - 1)
  const history = state.history
  const wantCost = !!plan.realism?.showCost && !!(plan.realism.fees || plan.realism.tax || plan.realism.inflation)
  const drop = result.median.drawdown

  return (
    <section className={`results predict-results${state.stale ? ' is-stale' : ''}`} aria-labelledby="predict-title" aria-busy={state.status === 'running'}>
      <StatusLine state={state} />
      {state.status === 'blocked' && <Blockers state={state} plan={plan} setPlan={setPlan} />}

      <div className="hero-lead" id="predict-title">
        By {end}
        {sold ? ', after selling everything and paying the tax,' : ''} the likely outcome is
        {result.switches.inflation && (
          <>
            {' '}
            <span className="todays-dollars">
              in today’s dollars <InfoTip term="todaysDollars" />
            </span>
          </>
        )}
      </div>
      <p className="hero-number">{money(result.final.mid, currency)}</p>
      <dl className="predict-range" aria-label="Final amount at each percentile">
        <div>
          <dt>{labels[0]}</dt>
          <dd>{money(result.final.low, currency)}</dd>
        </div>
        <div className="is-mid">
          <dt>{labels[1]}</dt>
          <dd>{money(result.final.mid, currency)}</dd>
        </div>
        <div>
          <dt>{labels[2]}</dt>
          <dd>{money(result.final.high, currency)}</dd>
        </div>
      </dl>
      <div className="predict-basis">
        An estimate from {count(result.runs)} replays of real history{history ? ` (${monthText(history.first)} to ${monthText(history.last)})` : ''}, not a promise. The future can be different. <HelpTip term="percentiles" />
      </div>

      <FanChart result={result} phases={plan.phases} currency={currency} onPickPhase={onPickPhase} showPaths={settings.showPaths} baseline={wantCost && state.cost ? state.cost.allOffMid : null} />
      <div className="predict-chart-controls">
        <Toggle
          label="Show single simulations"
          hint={`${result.paths.length} of the ${count(result.runs)}, picked at random`}
          checked={settings.showPaths}
          onChange={(showPaths) => setPlan(withPrediction(plan, { showPaths }))}
        />
        <button type="button" className="btn btn-quiet" onClick={() => setPlan(withPrediction(plan, { seed: newSeed() }))}>
          Re-roll
        </button>
        <HelpTip term="seed" />
      </div>

      {result.goal && (
        <div className="predict-goal">
          <div className="predict-goal-head">
            Your goal <HelpTip term="goalChance" />
          </div>
          <p className="predict-goal-text">
            In {count(result.goal.count)} of {count(result.runs)} simulations ({pct(result.goal.share)}) you reached {money(result.goal.amount, currency)}
            {result.goal.inTodaysDollars ? ' in today’s dollars' : ''} by {dateLong(result.goal.day)}.
          </p>
          <div className="meter" role="img" aria-label={`${pct(result.goal.share)} of simulations reached the goal`}>
            <span style={{ width: `${result.goal.share * 100}%` }} />
          </div>
          <p className="block-hint">
            {result.goal.outsidePlan ? `Your goal date is outside the plan, so this checks ${dateLong(result.goal.day)}. ` : ''}
            This counts your balance on that day. It’s an estimate based on history, not a guarantee.
          </p>
        </div>
      )}

      <div className="predict-stats">
        <div>
          <div className="predict-stat-label">
            Ending below what you put in <HelpTip term="belowPutIn" />
          </div>
          <div className="predict-stat-value">{pct(result.belowPutIn.share)}</div>
          <p>
            {count(result.belowPutIn.count)} of {count(result.runs)} simulations
          </p>
        </div>
        <div>
          <div className="predict-stat-label">
            Biggest drop along the way <HelpTip term="drawdown" />
          </div>
          <div className="predict-stat-value">{drop ? `−${Math.round(drop.drop * 100)}%` : 'None'}</div>
          <p>{drop ? `In the likely simulation, from ${dateMonthYear(drop.peakDay)} to ${dateMonthYear(drop.troughDay)}` : 'The likely simulation never fell'}</p>
        </div>
      </div>

      {wantCost &&
        (state.cost && state.cost.steps.length > 0 ? (
          <CostPanel start={state.cost.allOff} steps={state.cost.steps} currency={currency} note="In Prediction mode each amount is the likely (median) result." />
        ) : (
          <p className="block-hint">Working out the cost of fees, tax and inflation…</p>
        ))}

      <div className="predict-detail">
        <h3 className="sub-head">The likely simulation in detail</h3>
        <p className="block-hint">
          One replay of history: the one with the middle final amount. It ends at {money(v.final, currency)}; the “Likely” figure above is the median of all {result.runs.toLocaleString('en-AU')}, so the two can differ a little. Real years will be different.
        </p>
        <dl className="totals realism-totals">
          <div>
            <dt>Starting balance</dt>
            <dd>{money(d.startingBalance, currency)}</dd>
          </div>
          <div>
            <dt>Put in</dt>
            <dd>{money(v.deposited, currency)}</dd>
          </div>
          <div>
            <dt>Taken out</dt>
            <dd>{money(v.withdrawn, currency)}</dd>
          </div>
          <div>
            <dt>{v.real ? 'Growth after inflation' : d.switches.fees || d.switches.tax ? 'Growth before costs' : 'Growth'}</dt>
            <dd>{money(v.growth, currency)}</dd>
          </div>
          {d.switches.fees && (
            <div>
              <dt>Fees paid</dt>
              <dd>{money(v.fees, currency)}</dd>
            </div>
          )}
          {d.switches.tax && (
            <div>
              <dt>{v.tax < 0 ? 'Tax refunded' : 'Tax paid'}</dt>
              <dd>{money(Math.abs(v.tax), currency)}</dd>
            </div>
          )}
          {d.switches.tax && d.totalPaidOut > 0 && (
            <div>
              <dt>Paid to you</dt>
              <dd>{money(v.paidOut, currency)}</dd>
            </div>
          )}
          {v.real && (
            <div>
              <dt>In {yearOf(d.endDay - 1)} dollars</dt>
              <dd>{money(d.finalBalance, currency)}</dd>
            </div>
          )}
        </dl>
        {d.switches.tax && d.endSale && <EndSaleNote result={d} currency={currency} />}
        {(d.switches.fees || d.switches.tax) && <Breakdown result={d} currency={currency} />}
      </div>

      {(result.warnings.length > 0 || d.warnings.length > 0 || result.runsWithWarnings > 0) && (
        <ul className="warnings">
          {result.warnings.map((w, i) => (
            <li key={`r${i}`}>{w}</li>
          ))}
          {result.runWarnings.slice(0, 4).map((w, i) => (
            <li key={`w${i}`}>
              In {count(w.count)} of {count(result.runs)} simulations: {w.example}
              {w.count > 1 ? ' (amounts differ between simulations)' : ''}
            </li>
          ))}
          {d.warnings
            .filter((w) => !result.runWarnings.some((k) => kindOf(k.example) === kindOf(w)))
            .map((w, i) => (
              <li key={`d${i}`}>{w}</li>
            ))}
        </ul>
      )}

      <p className="fine-print">
        Prediction mode keeps your phases, deposits and events exactly as entered and replays real months of returns, inflation
        {plan.currency === 'AUD' ? ' and the Australian dollar' : ' and exchange rates'} in random {settings.blockMonths}-month chunks. History doesn’t repeat exactly, so treat this as an
        estimate based on history, not a promise. {d.switches.fees ? '' : 'Fees are off, so returns are before each fund’s fee. '}
        {d.switches.tax ? 'Tax is a simplified estimate, not tax advice.' : ''}
      </p>
    </section>
  )
}

function StatusLine({ state }: { state: PredictionState }) {
  const p = state.progress
  if (state.status === 'loading') return <p className="predict-status">Loading market history…</p>
  if (state.status === 'noData') {
    return <p className="predict-status is-problem">The market history isn’t on this device yet. Connect to the internet and open the app again to download it.</p>
  }
  if (state.status === 'error') return <p className="predict-status is-problem">Something went wrong: {state.error}</p>
  if (state.status !== 'running') return null
  const share = p && p.total > 0 ? p.done / p.total : 0
  const text = !p
    ? 'Getting ready…'
    : p.stage === 'cost'
      ? 'Working out the cost of each switch…'
      : `Replaying history: ${count(p.done)} of ${count(p.total)} simulations`
  if (p?.stage === 'cost' && !state.stale) return null
  return (
    <div className="predict-status" role="status">
      <span>{state.result ? `Updating. ${text}` : text}</span>
      <div className="progress" aria-hidden="true">
        <span style={{ width: `${Math.round(share * 100)}%` }} />
      </div>
    </div>
  )
}

/** What needs fixing before Prediction mode can run, with a quick way to choose an investment for every phase. */
function Blockers({ state, plan, setPlan }: { state: PredictionState; plan: Plan; setPlan: (p: Plan) => void }) {
  const { data: etfs } = useDataFile<EtfsFile>('etfs.json')
  const missing = plan.phases.filter((p) => !p.investment)
  const choices = etfChoices(etfs)
  const options = choices.all
  const [pick, setPick] = useState('VAS')
  const shown = [
    ...state.problems.filter((p) => !(missing.length > 0 && /choose what it’s invested in/.test(p.message))).map((p) => p.message),
    ...(state.historyProblem ? [state.historyProblem] : []),
  ]
  const choice = options.some((o) => o.value === pick) ? pick : (options[0]?.value ?? 'VAS')
  return (
    <div className="predict-blockers">
      {missing.length > 0 && (
        <div className="predict-quickfix">
          <p>
            {missing.length === plan.phases.length ? 'None of your phases say' : `${missing.length} of your phases don’t say`} what {missing.length === 1 ? 'it’s' : 'they’re'} invested
            in yet. Prediction mode needs that to know which history to replay.
          </p>
          {options.length > 0 && (
            <div className="predict-quickfix-row">
              <EtfSelect label="ETF for those phases" value={choice} choices={choices} onChange={setPick} />
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setPlan({ ...plan, phases: plan.phases.map((p) => (p.investment ? p : withInvestment(p, { kind: 'etf', etf: choice }, etfs, plan.currency))) })}
              >
                Use for {missing.length === 1 ? 'that phase' : `those ${missing.length} phases`}
              </button>
            </div>
          )}
          <p className="block-hint">Or open each phase and choose under “What it’s invested in”.</p>
        </div>
      )}
      {shown.length > 0 && (
        <ul className="problems">
          {shown.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

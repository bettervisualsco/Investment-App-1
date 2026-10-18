import { InfoTip } from '../components/InfoTip'
import { DownloadIcon } from '../components/Icons'
import { financialYearLabel, type ManualResult } from '../engine/manual'
import type { Currency, Phase } from '../engine/types'
import { downloadText, yearTableCsv } from '../lib/csv'
import { dateLong, dateMonthYear, money } from '../lib/format'
import { GrowthChart } from './GrowthChart'

export function ResultsHero({
  result,
  phases,
  currency,
  onPickPhase,
}: {
  result: ManualResult
  phases: Phase[]
  currency: Currency
  onPickPhase: (id: string) => void
}) {
  const growth = result.finalBalance - result.netContributed
  return (
    <section className="results" aria-labelledby="result-title">
      <p className="hero-lead" id="result-title">
        By {dateLong(result.endDay - 1)} you’d have
      </p>
      <p className="hero-number">{money(result.finalBalance, currency)}</p>
      <div className="hero-split">
        <div className="hero-stat">
          <span className="key key-mine" aria-hidden="true" />
          <span className="hero-stat-label">
            Your money <InfoTip term="yourMoney" />
          </span>
          <span className="hero-stat-value">{money(result.netContributed, currency)}</span>
        </div>
        <div className="hero-stat">
          <span className="key key-growth" aria-hidden="true" />
          <span className="hero-stat-label">
            Growth <InfoTip term="growth" />
          </span>
          <span className="hero-stat-value">{money(growth, currency)}</span>
        </div>
      </div>

      <GrowthChart result={result} phases={phases} currency={currency} onPickPhase={onPickPhase} />

      {result.goal && <GoalVerdict goal={result.goal} currency={currency} />}

      <dl className="totals">
        <div>
          <dt>Starting balance</dt>
          <dd>{money(result.startingBalance, currency)}</dd>
        </div>
        <div>
          <dt>Put in</dt>
          <dd>{money(result.totalDeposited, currency)}</dd>
        </div>
        <div>
          <dt>Taken out</dt>
          <dd>{money(result.totalWithdrawn, currency)}</dd>
        </div>
        <div>
          <dt>Growth</dt>
          <dd>{money(growth, currency)}</dd>
        </div>
      </dl>

      {result.warnings.length > 0 && (
        <ul className="warnings">
          {result.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}

      <p className="fine-print">
        Using the return rates you entered, before fees, tax and inflation. Real returns go up and down, so treat this as an estimate, not a promise.
      </p>
    </section>
  )
}

function GoalVerdict({ goal, currency }: { goal: NonNullable<ManualResult['goal']>; currency: Currency }) {
  const gap = goal.amount - goal.balanceOnDay
  return (
    <div className={`goal-verdict ${goal.reached ? 'is-met' : 'is-short'}`}>
      <p className="goal-verdict-head">
        {goal.reached ? 'Goal reached at these rates' : `Short of your goal by ${money(gap, currency)}`}
      </p>
      <p>
        {goal.outsidePlan ? `Your goal date is outside the plan, so this checks ${dateLong(goal.day)}. ` : ''}
        On {dateLong(goal.day)} you’d have {money(goal.balanceOnDay, currency)} of your {money(goal.amount, currency)} goal.
        {goal.firstReachedDay !== null && ` You’d first pass it in ${dateMonthYear(goal.firstReachedDay)}.`}
      </p>
    </div>
  )
}

export function YearTable({ result, currency, planName }: { result: ManualResult; currency: Currency; planName: string }) {
  return (
    <details className="block year-table-block">
      <summary>
        <span>
          Year by year <InfoTip term="financialYear" />
        </span>
        <span className="summary-hint">{result.years.length} financial years</span>
      </summary>
      <div className="table-scroll">
        <table className="year-table">
          <thead>
            <tr>
              <th scope="col">Year</th>
              <th scope="col">Start</th>
              <th scope="col">Put in</th>
              <th scope="col">Taken out</th>
              <th scope="col">Growth</th>
              <th scope="col">End</th>
            </tr>
          </thead>
          <tbody>
            {result.years.map((y) => (
              <tr key={y.fy}>
                <th scope="row">{financialYearLabel(y.fy)}</th>
                <td>{money(y.opening, currency)}</td>
                <td>{money(y.deposits, currency)}</td>
                <td>{y.withdrawals ? money(-y.withdrawals, currency) : '—'}</td>
                <td>{money(y.growth, currency)}</td>
                <td>{money(y.closing, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        className="btn btn-quiet"
        onClick={() => downloadText(`${planName.replace(/[^\w -]+/g, '').trim() || 'plan'} - year by year.csv`, yearTableCsv(result, planName))}
      >
        <DownloadIcon /> Download as spreadsheet (CSV)
      </button>
    </details>
  )
}

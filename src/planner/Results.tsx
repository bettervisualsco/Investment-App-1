import { InfoTip } from '../components/InfoTip'
import { DownloadIcon } from '../components/Icons'
import { financialYearLabel, type CostComparison, type ManualResult } from '../engine/manual'
import type { Currency, Phase, Realism } from '../engine/types'
import { downloadText } from '../lib/csv'
import { dateLong, dateMonthYear, money, yearOf } from '../lib/format'
import { GrowthChart } from './GrowthChart'
import { viewOf } from './realismView'
import { yearTableCsv } from './yearCsv'

export function ResultsHero({
  result,
  comparison,
  phases,
  currency,
  realism,
  onPickPhase,
}: {
  result: ManualResult
  comparison: CostComparison | null
  phases: Phase[]
  currency: Currency
  realism: Realism
  onPickPhase: (id: string) => void
}) {
  const v = viewOf(result)
  const sw = result.switches
  const growthAfterCosts = v.final - v.net
  const sold = result.endSale?.mode === 'sell'
  const lead = sold ? `By ${dateLong(result.endDay - 1)}, after selling everything and paying the tax, you’d have` : `By ${dateLong(result.endDay - 1)} you’d have`

  return (
    <section className="results" aria-labelledby="result-title">
      <div className="hero-lead" id="result-title">
        {lead}
        {v.real && (
          <>
            {' '}
            <span className="todays-dollars">
              in today’s dollars <InfoTip term="todaysDollars" />
            </span>
          </>
        )}
      </div>
      <p className="hero-number">{money(v.final, currency)}</p>
      {v.real && (
        <p className="hero-sub">
          That’s {money(result.finalBalance, currency)} in {yearOf(result.endDay - 1)} dollars, with prices {Math.round((result.cpiEnd - 1) * 100)}% higher than at the start.
        </p>
      )}
      <div className="hero-split">
        <div className="hero-stat">
          <span className="key key-mine" aria-hidden="true" />
          <span className="hero-stat-label">
            Your money <InfoTip term="yourMoney" />
          </span>
          <span className="hero-stat-value">{money(v.net, currency)}</span>
        </div>
        <div className="hero-stat">
          <span className="key key-growth" aria-hidden="true" />
          <span className="hero-stat-label">
            {sw.fees || sw.tax ? 'Growth after costs' : 'Growth'} <InfoTip term="growth" />
          </span>
          <span className="hero-stat-value">{money(growthAfterCosts, currency)}</span>
        </div>
      </div>

      <GrowthChart result={result} phases={phases} currency={currency} onPickPhase={onPickPhase} baseline={realism.showCost && comparison ? comparison.allOff : null} />

      {result.goal && <GoalVerdict goal={result.goal} currency={currency} />}

      {realism.showCost && comparison && comparison.steps.length > 0 && <CostPanel comparison={comparison} currency={currency} />}

      <dl className="totals realism-totals">
        <div>
          <dt>Starting balance</dt>
          <dd>{money(result.startingBalance, currency)}</dd>
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
          <dt>{sw.fees || sw.tax ? (v.real ? 'Growth after inflation' : 'Growth before costs') : v.real ? 'Growth after inflation' : 'Growth'}</dt>
          <dd>{money(v.growth, currency)}</dd>
        </div>
        {sw.fees && (
          <div>
            <dt>Fees paid</dt>
            <dd>{money(v.fees, currency)}</dd>
          </div>
        )}
        {sw.tax && (
          <div>
            <dt>{v.tax < 0 ? 'Tax refunded' : 'Tax paid'}</dt>
            <dd>{money(Math.abs(v.tax), currency)}</dd>
          </div>
        )}
        {sw.tax && result.totalPaidOut > 0 && (
          <div>
            <dt>Paid to you</dt>
            <dd>{money(v.paidOut, currency)}</dd>
          </div>
        )}
        {v.real && (
          <div>
            <dt>In {yearOf(result.endDay - 1)} dollars</dt>
            <dd>{money(result.finalBalance, currency)}</dd>
          </div>
        )}
      </dl>

      {sw.tax && result.endSale && <EndSaleNote result={result} currency={currency} />}
      {(sw.fees || sw.tax) && <Breakdown result={result} currency={currency} />}

      {result.warnings.length > 0 && (
        <ul className="warnings">
          {result.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}

      <p className="fine-print">{finePrint(result)}</p>
    </section>
  )
}

function finePrint(result: ManualResult): string {
  const sw = result.switches
  const on = [sw.fees && 'fees', sw.tax && 'tax', sw.inflation && 'inflation'].filter(Boolean) as string[]
  const off = ['fees', 'tax', 'inflation'].filter((x) => !on.includes(x))
  const parts = ['Using the return rates you entered']
  if (on.length) parts.push(`, including ${listWords(on)}`)
  if (off.length) parts.push(`${on.length ? ' but' : ','} before ${listWords(off)}`)
  let text = parts.join('') + '. Real returns go up and down, so treat this as an estimate, not a promise.'
  if (sw.tax) text += ' Tax is a simplified estimate, not tax advice.'
  return text
}

function listWords(words: string[]): string {
  if (words.length <= 1) return words.join('')
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
}

function EndSaleNote({ result, currency }: { result: ManualResult; currency: Currency }) {
  const s = result.endSale!
  const v = viewOf(result)
  const day = dateLong(result.endDay - 1)
  return (
    <div className="end-sale">
      <div className="end-sale-head">
        {s.mode === 'sell' ? 'Selling everything at the end' : 'If you sold everything at the end'} <InfoTip term="atEnd" />
      </div>
      {s.mode === 'sell' ? (
        <p>
          On {day} your investments are worth {money(v.atEnd(s.marketValue), currency)}. Selling costs {money(v.atEnd(s.costs), currency)} and adds about{' '}
          {money(v.atEnd(s.tax), currency)} of tax, leaving {money(v.atEnd(s.afterTax), currency)}. Both are already taken off the totals above.
        </p>
      ) : (
        <p>
          You keep {money(v.atEnd(s.marketValue), currency)} invested. If you sold it all on {day}, you’d owe about {money(v.atEnd(Math.max(0, s.tax)), currency)} in tax
          {s.costs > 0 ? ` and pay ${money(v.atEnd(s.costs), currency)} in selling costs` : ''}, leaving about {money(v.atEnd(s.afterTax), currency)}.
        </p>
      )}
    </div>
  )
}

function Breakdown({ result, currency }: { result: ManualResult; currency: Currency }) {
  const f = result.fees
  const t = result.tax
  const sw = result.switches
  const rows = (items: [string, number][]) =>
    items
      .filter(([, n]) => Math.abs(n) >= 0.5)
      .map(([label, n]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{money(n, currency)}</dd>
        </div>
      ))
  return (
    <details className="breakdown">
      <summary>Where the fees and tax went{sw.inflation ? ' (in future dollars)' : ''}</summary>
      {sw.fees && (
        <dl className="breakdown-list">
          {rows([
            ['Management fee (MER)', f.mer],
            ['Brokerage', f.brokerage],
            ['Currency conversion', f.currency],
            ['Buy/sell spread', f.spread],
            ['Platform fee', f.platform],
          ])}
          <div className="breakdown-total">
            <dt>Fees</dt>
            <dd>{money(f.total, currency)}</dd>
          </div>
        </dl>
      )}
      {sw.tax && (
        <dl className="breakdown-list">
          {rows([
            ['Distributions received', t.distributionsReceived],
            ['Franking credits', t.frankingCredits],
            ['Foreign tax offset', t.foreignTaxOffset],
            ['Interest on waiting cash', t.interest],
            ['Net capital gains (taxable part)', t.netCapitalGains],
          ])}
          {t.unpaid > 0.5 && (
            <div>
              <dt>Tax that couldn’t be paid</dt>
              <dd>{money(t.unpaid, currency)}</dd>
            </div>
          )}
          <div className="breakdown-total">
            <dt>{t.total < 0 ? 'Tax refunded (franking credits)' : 'Tax paid (after credits)'}</dt>
            <dd>{money(Math.abs(t.total), currency)}</dd>
          </div>
        </dl>
      )}
    </details>
  )
}

function CostPanel({ comparison, currency }: { comparison: CostComparison; currency: Currency }) {
  const start = comparison.allOff.finalBalance
  const names = { fees: 'Fees', tax: 'Tax', inflation: 'Inflation' } as const
  const end = comparison.steps[comparison.steps.length - 1].after
  const scale = Math.max(start, ...comparison.steps.map((s) => s.after), 1)
  return (
    <div className="cost-panel" aria-label="What each switch costs">
      <div className="cost-head">
        The cost of real life <InfoTip term="showCost" />
      </div>
      <div className="cost-row">
        <span className="cost-label">Everything off</span>
        <span className="cost-bar">
          <span className="cost-fill is-base" style={{ width: `${(start / scale) * 100}%` }} />
        </span>
        <span className="cost-value">{money(start, currency)}</span>
      </div>
      {comparison.steps.map((s) => (
        <div className="cost-row" key={s.switch}>
          <span className="cost-label">
            {names[s.switch]} {s.cost >= 0 ? 'take' : 'add'}
          </span>
          <span className="cost-bar">
            <span className={`cost-fill is-${s.switch}`} style={{ width: `${(Math.max(0, s.cost) / scale) * 100}%` }} />
          </span>
          <span className="cost-value">{s.cost >= 0 ? `−${money(s.cost, currency)}` : `+${money(-s.cost, currency)}`}</span>
        </div>
      ))}
      <div className="cost-row is-total">
        <span className="cost-label">You keep</span>
        <span className="cost-bar">
          <span className="cost-fill is-keep" style={{ width: `${(Math.max(0, end) / scale) * 100}%` }} />
        </span>
        <span className="cost-value">{money(end, currency)}</span>
      </div>
      <p className="block-hint">
        Turned on one at a time: fees, then tax, then inflation{comparison.steps.some((s) => s.switch === 'inflation') ? ' (that last one is the loss of buying power, in today’s dollars)' : ''}. The dashed line
        on the chart is everything off.
      </p>
    </div>
  )
}

function GoalVerdict({ goal, currency }: { goal: NonNullable<ManualResult['goal']>; currency: Currency }) {
  const gap = goal.amount - goal.balanceOnDay
  const dollars = goal.inTodaysDollars ? ' (in today’s dollars)' : ''
  return (
    <div className={`goal-verdict ${goal.reached ? 'is-met' : 'is-short'}`}>
      <p className="goal-verdict-head">{goal.reached ? 'Goal reached at these rates' : `Short of your goal by ${money(gap, currency)}${dollars}`}</p>
      <p>
        {goal.outsidePlan ? `Your goal date is outside the plan, so this checks ${dateLong(goal.day)}. ` : ''}
        On {dateLong(goal.day)} you’d have {money(goal.balanceOnDay, currency)} of your {money(goal.amount, currency)} goal{dollars}.
        {goal.firstReachedDay !== null && ` You’d first pass it in ${dateMonthYear(goal.firstReachedDay)}.`}
      </p>
    </div>
  )
}

export function YearTable({ result, currency, planName }: { result: ManualResult; currency: Currency; planName: string }) {
  const sw = result.switches
  const real = sw.inflation
  const showPaidOut = sw.tax && result.totalPaidOut > 0
  return (
    <details className="block year-table-block">
      <summary>
        <span>
          Year by year <InfoTip term="financialYear" />
        </span>
        <span className="summary-hint">
          {result.years.length} financial years{real ? ', today’s dollars' : ''}
        </span>
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
              {sw.fees && <th scope="col">Fees</th>}
              {sw.tax && <th scope="col">Tax</th>}
              {showPaidOut && <th scope="col">Paid to you</th>}
              <th scope="col">End</th>
              {real && <th scope="col">End (that year’s $)</th>}
            </tr>
          </thead>
          <tbody>
            {result.years.map((y) => {
              const v = real ? y.real : y
              return (
                <tr key={y.fy}>
                  <th scope="row">{financialYearLabel(y.fy)}</th>
                  <td>{money(v.opening, currency)}</td>
                  <td>{money(v.deposits, currency)}</td>
                  <td>{v.withdrawals ? money(-v.withdrawals, currency) : '—'}</td>
                  <td>{money(v.growth, currency)}</td>
                  {sw.fees && <td>{Math.abs(v.fees) >= 0.5 ? money(-v.fees, currency) : '—'}</td>}
                  {sw.tax && <td>{Math.abs(v.tax) >= 0.5 ? (v.tax < 0 ? `+${money(-v.tax, currency)}` : money(-v.tax, currency)) : '—'}</td>}
                  {showPaidOut && <td>{Math.abs(v.paidOut) >= 0.5 ? money(-v.paidOut, currency) : '—'}</td>}
                  <td>{money(v.closing, currency)}</td>
                  {real && <td className="muted-cell">{money(y.closing, currency)}</td>}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {sw.tax && <p className="block-hint">Tax is a simplified estimate for each financial year. A minus sign means money out; a refund shows as a plus.</p>}
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

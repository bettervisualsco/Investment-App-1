import { useMemo } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts'
import { toDayNumber } from '../engine/dates'
import type { ManualResult } from '../engine/manual'
import type { Plan } from '../engine/types'
import { dateLong, dateMonthYear, money, moneyCompact, yearOf } from '../lib/format'
import { mergeSeries, runPlan, type PlanOutcome } from './compare'
import { displayName } from './status'
import { HelpTip } from './ui'

const COLORS = ['var(--compare-1)', 'var(--compare-2)', 'var(--compare-3)']

interface ChartRow {
  day: number
  [key: `p${number}`]: number | null
}

function yearTicks(start: number, end: number): number[] {
  const first = yearOf(start) + 1
  const last = yearOf(end)
  const span = Math.max(1, last - first)
  const step = [1, 2, 5, 10, 20, 25, 50].find((s) => span / s <= 6) ?? 50
  const ticks: number[] = []
  for (let y = Math.ceil(first / step) * step; y <= last; y += step) {
    const day = toDayNumber({ y, m: 1, d: 1 })
    if (day > start && day < end) ticks.push(day)
  }
  return ticks
}

function moneyTicks(max: number): number[] {
  if (max <= 0) return [0, 10_000]
  const rough = max / 4
  const mag = Math.pow(10, Math.floor(Math.log10(rough)))
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * mag >= rough) ?? 10) * mag
  const ticks: number[] = []
  for (let t = 0; t < max + step; t += step) ticks.push(t)
  return ticks
}

function lengthText(r: ManualResult): string {
  const days = r.endDay - r.startDay
  const years = days / 365.25
  if (years >= 1.95) return `${Math.round(years)} years`
  const months = Math.round(days / 30.44)
  return months >= 2 ? `${months} months` : `${days} days`
}

export function CompareView({ plans, onBack, onOpen }: { plans: Plan[]; onBack: () => void; onOpen: (plan: Plan) => void }) {
  const outcomes: PlanOutcome[] = useMemo(() => plans.map(runPlan), [plans])
  const results = useMemo(() => outcomes.map((o) => (o.ok ? o.result : null)), [outcomes])
  const mixedCurrency = new Set(plans.map((p) => p.currency)).size > 1
  const mixedSwitches = new Set(results.filter((r) => r).map((r) => switchesText(r!))).size > 1
  const overlapping = useMemo(() => {
    const same = (a: ManualResult, b: ManualResult) => a.series.length === b.series.length && a.series.every((p, i) => p.day === b.series[i].day && p.balance === b.series[i].balance)
    return results.some((a, i) => a && results.some((b, j) => j > i && b && same(a, b)))
  }, [results])

  return (
    <div className="page-wide compare">
      <button type="button" className="btn btn-quiet back-btn" onClick={onBack}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" />
        </svg>
        Saved plans
      </button>
      <h1 className="saved-title">
        Compare plans <HelpTip term="compare" />
      </h1>

      <section className="results compare-card" aria-label="Balances over time">
        <ul className="compare-legend">
          {plans.map((p, i) => (
            <li key={p.id}>
              <span className="compare-key" style={{ background: COLORS[i] }} aria-hidden="true" />
              {displayName(p)}
            </li>
          ))}
        </ul>
        {results.some(Boolean) ? <CompareChart plans={plans} results={results} /> : <p className="block-hint">None of these plans can be worked out yet.</p>}
        {mixedSwitches && (
          <p className="block-hint">These plans use different Fees, Tax and Inflation switches, so their numbers aren’t like for like. The chart shows amounts before inflation.</p>
        )}
        {overlapping && <p className="block-hint">Some lines sit exactly on top of each other, because those plans give the same balances.</p>}
        {mixedCurrency && <p className="saved-note">These plans use different currencies (AUD and USD), so their amounts can’t be compared directly.</p>}
      </section>

      <section className="block compare-table-block" aria-label="Key numbers">
        <div className="table-scroll">
          <table className="compare-table">
            <thead>
              <tr>
                <td />
                {plans.map((p, i) => (
                  <th key={p.id} scope="col">
                    <span className="compare-key" style={{ background: COLORS[i] }} aria-hidden="true" />
                    {displayName(p)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <Row label="At the end" outcomes={outcomes} plans={plans} strong value={(r, p) => money(r.finalBalance, p.currency)} />
              <Row label="Switches on" outcomes={outcomes} plans={plans} value={(r) => switchesText(r)} />
              <Row label="In today’s dollars" outcomes={outcomes} plans={plans} value={(r, p) => (r.switches.inflation ? money(r.finalReal, p.currency) : '—')} />
              <Row label="Fees paid" outcomes={outcomes} plans={plans} value={(r, p) => (r.switches.fees ? money(r.fees.total, p.currency) : '—')} />
              <Row
                label="Tax paid"
                outcomes={outcomes}
                plans={plans}
                value={(r, p) => (!r.switches.tax ? '—' : r.tax.total < 0 ? `${money(-r.tax.total, p.currency)} refunded` : money(r.tax.total, p.currency))}
              />
              <Row label="Ends on" outcomes={outcomes} plans={plans} value={(r) => dateLong(r.endDay - 1)} />
              <Row label="Length" outcomes={outcomes} plans={plans} value={(r) => lengthText(r)} />
              <Row label="Starting balance" outcomes={outcomes} plans={plans} value={(r, p) => money(r.startingBalance, p.currency)} />
              <Row label="Put in" outcomes={outcomes} plans={plans} value={(r, p) => money(r.totalDeposited, p.currency)} />
              <Row label="Taken out" outcomes={outcomes} plans={plans} value={(r, p) => (r.totalWithdrawn ? money(-r.totalWithdrawn, p.currency) : '—')} />
              <Row label="Your money" outcomes={outcomes} plans={plans} value={(r, p) => money(r.netContributed, p.currency)} />
              <Row label="Growth" outcomes={outcomes} plans={plans} value={(r, p) => money(r.finalBalance - r.netContributed, p.currency)} />
              <Row
                label="Goal"
                outcomes={outcomes}
                plans={plans}
                value={(r, p) =>
                  r.goal ? (r.goal.reached ? `Reached (${money(r.goal.amount, p.currency)})` : `Short by ${money(r.goal.amount - r.goal.balanceOnDay, p.currency)}`) : 'No goal'
                }
              />
              <tr>
                <th scope="row">Phases</th>
                {plans.map((p) => (
                  <td key={p.id}>{p.phases.length}</td>
                ))}
              </tr>
              <tr className="compare-open-row">
                <td />
                {plans.map((p) => (
                  <td key={p.id}>
                    <button type="button" className="btn btn-quiet" onClick={() => onOpen(p)}>
                      Open
                    </button>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        {outcomes.some((o) => !o.ok) && (
          <p className="saved-note">“Can’t work out yet” means the plan has something to fix. Open it in the Planner to see what.</p>
        )}
        <p className="fine-print">
          Each plan uses its own return rates, before fees, tax and inflation. Real returns go up and down, so these are estimates, not promises.
        </p>
      </section>
    </div>
  )
}

/** Which Fees / Tax / Inflation switches a plan's result used. */
function switchesText(r: ManualResult): string {
  const on = (['fees', 'tax', 'inflation'] as const).filter((k) => r.switches[k]).map((k) => k[0].toUpperCase() + k.slice(1))
  return on.length ? on.join(', ') : 'None'
}

function Row({
  label,
  outcomes,
  plans,
  value,
  strong = false,
}: {
  label: string
  outcomes: PlanOutcome[]
  plans: Plan[]
  value: (r: ManualResult, p: Plan) => string
  strong?: boolean
}) {
  return (
    <tr className={strong ? 'is-strong' : undefined}>
      <th scope="row">{label}</th>
      {outcomes.map((o, i) => (
        <td key={plans[i].id}>{o.ok ? value(o.result, plans[i]) : <span className="compare-cant">Can’t work out yet</span>}</td>
      ))}
    </tr>
  )
}

function CompareChart({ plans, results }: { plans: Plan[]; results: (ManualResult | null)[] }) {
  const rows: ChartRow[] = useMemo(
    () =>
      mergeSeries(results).map((r) => {
        const row: ChartRow = { day: r.day }
        r.values.forEach((v, i) => (row[`p${i}`] = v))
        return row
      }),
    [results],
  )
  const { start, end, xTicks, yTicks } = useMemo(() => {
    const present = results.filter((r): r is ManualResult => r !== null)
    const start = Math.min(...present.map((r) => r.startDay))
    const end = Math.max(...present.map((r) => r.endDay))
    const top = Math.max(...present.map((r) => Math.max(...r.series.map((p) => p.balance))))
    return { start, end, xTicks: yearTicks(start, end), yTicks: moneyTicks(top) }
  }, [results])
  const currency = plans[0].currency

  return (
    <figure className="compare-figure">
      <div className="chart-box">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 12, right: 14, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="0" />
            <XAxis
              dataKey="day"
              type="number"
              domain={[start, end]}
              ticks={xTicks}
              tickFormatter={(d: number) => String(yearOf(d))}
              tick={{ fill: 'var(--ink-3)', fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: 'var(--line)' }}
              allowDataOverflow
            />
            <YAxis
              width={60}
              tickFormatter={(c: number) => moneyCompact(c, currency)}
              tick={{ fill: 'var(--ink-3)', fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              ticks={yTicks}
              domain={[0, yTicks[yTicks.length - 1]]}
            />
            <Tooltip
              content={(props) => <CompareTip {...(props as TooltipContentProps<number, string>)} plans={plans} />}
              cursor={{ stroke: 'var(--ink-3)', strokeWidth: 1 }}
              isAnimationActive={false}
            />
            {plans.map((p, i) =>
              results[i] ? (
                <Line
                  key={p.id}
                  type="monotone"
                  dataKey={`p${i}`}
                  name={displayName(p)}
                  stroke={COLORS[i]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 5, fill: COLORS[i], stroke: 'var(--surface)', strokeWidth: 2 }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ) : null,
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="visually-hidden">Each saved plan’s balance over time, one line per plan. The table below has their key numbers.</figcaption>
    </figure>
  )
}

function CompareTip({ active, payload, plans }: TooltipContentProps<number, string> & { plans: Plan[] }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload as ChartRow
  return (
    <div className="chart-tip">
      <div className="chart-tip-date">Around {dateMonthYear(row.day)}</div>
      {plans.map((p, i) => {
        const v = row[`p${i}`]
        return (
          <div className="chart-tip-row" key={p.id}>
            <span className="compare-key" style={{ background: COLORS[i] }} aria-hidden="true" />
            <span className="compare-tip-name">{displayName(p)}</span>
            <strong>{v === null || v === undefined ? '—' : money(v, p.currency)}</strong>
          </div>
        )
      })}
    </div>
  )
}

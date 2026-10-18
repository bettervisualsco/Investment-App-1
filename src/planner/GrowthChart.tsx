import { useMemo } from 'react'
import { Area, ComposedChart, Line, ReferenceArea, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts'
import type { ManualResult } from '../engine/manual'
import type { Currency, Phase } from '../engine/types'
import { dateLong, money, moneyCompact, yearOf } from '../lib/format'
import { moneyTicks, yearTicks } from './chartTicks'

const Y_AXIS_WIDTH = 60
const RIGHT_GAP = 14

interface Row {
  day: number
  /** The part of the balance that is your own money. */
  mine: number
  /** The part that is growth (never below 0 for drawing). */
  growth: number
  balance: number
  net: number
  /** "Show the cost": the balance with every switch off. */
  baseline?: number
}

function ChartTooltip({ active, payload, currency }: TooltipContentProps<number, string> & { currency: Currency }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload as Row
  const growth = row.balance - row.net
  return (
    <div className="chart-tip">
      <div className="chart-tip-date">{dateLong(row.day)}</div>
      <div className="chart-tip-total">{money(row.balance, currency)}</div>
      <div className="chart-tip-row">
        <span className="key key-mine" aria-hidden="true" />
        Your money <strong>{money(row.net, currency)}</strong>
      </div>
      <div className="chart-tip-row">
        <span className="key key-growth" aria-hidden="true" />
        Growth <strong>{money(growth, currency)}</strong>
      </div>
      {row.baseline !== undefined && (
        <div className="chart-tip-row">
          <span className="key key-baseline" aria-hidden="true" />
          All switches off <strong>{money(row.baseline, currency)}</strong>
        </div>
      )}
    </div>
  )
}

/** Stacked chart of your money vs growth, with the life-timeline ribbon underneath. */
export function GrowthChart({
  result,
  phases,
  currency,
  onPickPhase,
  baseline = null,
}: {
  result: ManualResult
  phases: Phase[]
  currency: Currency
  onPickPhase: (id: string) => void
  /** "Show the cost": the same plan with every switch off, drawn as a dashed line. */
  baseline?: ManualResult | null
}) {
  const real = result.switches.inflation
  const rows: Row[] = useMemo(
    () =>
      result.series.map((p, i) => {
        // With Inflation on, everything is in today's dollars.
        const balance = real ? p.balance / p.cpi : p.balance
        const net = real ? p.realNet : p.netContributed
        const mine = Math.min(Math.max(net, 0), balance)
        const base = baseline?.series[i]
        return { day: p.day, mine, growth: Math.max(balance - mine, 0), balance, net, ...(base ? { baseline: base.balance } : {}) }
      }),
    [result, baseline, real],
  )
  const ticks = useMemo(() => yearTicks(result.startDay, result.endDay), [result])
  const total = result.endDay - result.startDay
  const goal = result.goal
  const yTicks = useMemo(() => {
    const top = Math.max(...rows.map((r) => Math.max(r.balance, r.baseline ?? 0)), goal && !goal.outsidePlan ? goal.amount : 0)
    return moneyTicks(top)
  }, [rows, goal])

  return (
    <figure className="growth-figure">
      <div className="chart-box">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 12, right: RIGHT_GAP, bottom: 0, left: 0 }}>
            {result.phases.map((p, i) =>
              i % 2 === 1 ? <ReferenceArea key={p.phaseId} x1={p.start} x2={p.end} fill="var(--band)" fillOpacity={1} strokeOpacity={0} ifOverflow="hidden" /> : null,
            )}
            <XAxis
              dataKey="day"
              type="number"
              domain={[result.startDay, result.endDay]}
              ticks={ticks}
              tickFormatter={(d: number) => String(yearOf(d))}
              tick={{ fill: 'var(--ink-3)', fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: 'var(--line)' }}
              allowDataOverflow
            />
            <YAxis
              width={Y_AXIS_WIDTH}
              tickFormatter={(c: number) => moneyCompact(c, currency)}
              tick={{ fill: 'var(--ink-3)', fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              ticks={yTicks}
              domain={[0, yTicks[yTicks.length - 1]]}
            />
            <Tooltip
              content={(props) => <ChartTooltip {...(props as TooltipContentProps<number, string>)} currency={currency} />}
              cursor={{ stroke: 'var(--ink-3)', strokeWidth: 1 }}
              isAnimationActive={false}
            />
            <Area type="monotone" dataKey="mine" stackId="1" stroke="var(--series-mine)" strokeWidth={2} fill="var(--series-mine)" fillOpacity={0.22} isAnimationActive={false} />
            <Area type="monotone" dataKey="growth" stackId="1" stroke="var(--series-growth)" strokeWidth={2} fill="var(--series-growth)" fillOpacity={0.26} isAnimationActive={false} />
            {baseline && (
              <Line type="monotone" dataKey="baseline" stroke="var(--ink-2)" strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={false} isAnimationActive={false} />
            )}
            {goal && !goal.outsidePlan && (
              <ReferenceDot x={goal.day + 1} y={goal.amount} r={5}
                fill="var(--surface)"
                stroke="var(--ink)"
                strokeWidth={2}
                label={{ value: 'Goal', position: 'left', fill: 'var(--ink-2)', fontSize: 12, fontWeight: 600 }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="ribbon" style={{ paddingLeft: Y_AXIS_WIDTH, paddingRight: RIGHT_GAP }} aria-label="Phases on the timeline">
        {result.phases.map((p, i) => {
          const phase = phases.find((x) => x.id === p.phaseId)
          const share = (p.end - p.start) / total
          const name = phase?.name || `Phase ${i + 1}`
          return (
            <button
              key={p.phaseId}
              type="button"
              className={`ribbon-seg${i % 2 === 1 ? ' is-alt' : ''}`}
              style={{ flexGrow: share, flexBasis: 0 }}
              title={`${name}: ${dateLong(p.start)} to ${dateLong(p.end - 1)}`}
              onClick={() => onPickPhase(p.phaseId)}
            >
              {share > 0.07 && <span className="ribbon-name">{name}</span>}
            </button>
          )
        })}
      </div>
      <figcaption className="visually-hidden">
        Chart of your balance over time{real ? ' in today’s dollars' : ''}, split into your own money and growth{baseline ? ', with a dashed line for the same plan with every switch off' : ''}, from {dateLong(result.startDay)} to {dateLong(result.endDay - 1)}. The year-by-year table
        below has the same numbers.
      </figcaption>
    </figure>
  )
}

import { useMemo } from 'react'
import { Area, ComposedChart, Line, ReferenceArea, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts'
import type { PredictionResult } from '../engine/prediction'
import type { Currency, Phase } from '../engine/types'
import { dateLong, money, moneyCompact, yearOf } from '../lib/format'
import { moneyTicks, yearTicks } from './chartTicks'
import { percentileLabels } from './words'

const Y_AXIS_WIDTH = 60
const RIGHT_GAP = 14

interface Row {
  day: number
  outer: [number, number]
  inner: [number, number]
  low: number
  mid: number
  high: number
  baseline?: number
  [path: `p${number}`]: number
}

function FanTooltip({ active, payload, currency, labels }: TooltipContentProps<number, string> & { currency: Currency; labels: [string, string, string] }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload as Row
  return (
    <div className="chart-tip">
      <div className="chart-tip-date">Around {dateLong(row.day)}</div>
      <div className="chart-tip-row">
        <span className="fan-key fan-key-edge" aria-hidden="true" />
        {labels[2]} <strong>{money(row.high, currency)}</strong>
      </div>
      <div className="chart-tip-row">
        <span className="fan-key fan-key-mid" aria-hidden="true" />
        {labels[1]} <strong>{money(row.mid, currency)}</strong>
      </div>
      <div className="chart-tip-row">
        <span className="fan-key fan-key-edge" aria-hidden="true" />
        {labels[0]} <strong>{money(row.low, currency)}</strong>
      </div>
      {row.baseline !== undefined && (
        <div className="chart-tip-row">
          <span className="key key-baseline" aria-hidden="true" />
          All switches off (likely) <strong>{money(row.baseline, currency)}</strong>
        </div>
      )}
    </div>
  )
}

/** Fan chart: worst / likely / best lines with shaded bands, optional single simulations, and the life-timeline ribbon. */
export function FanChart({
  result,
  phases,
  currency,
  onPickPhase,
  showPaths,
  baseline = null,
}: {
  result: PredictionResult
  phases: Phase[]
  currency: Currency
  onPickPhase: (id: string) => void
  showPaths: boolean
  /** "Show the cost": the middle line with every switch off, drawn dashed. */
  baseline?: Float64Array | null
}) {
  const { days, bands, paths } = result
  const rows: Row[] = useMemo(
    () =>
      Array.from(days, (day, j) => {
        const row: Row = {
          day,
          outer: [bands.low[j], bands.high[j]],
          inner: [bands.innerLow[j], bands.innerHigh[j]],
          low: bands.low[j],
          mid: bands.mid[j],
          high: bands.high[j],
        }
        if (baseline) row.baseline = baseline[j]
        paths.forEach((p, i) => (row[`p${i}`] = p[j]))
        return row
      }),
    [days, bands, paths, baseline],
  )
  const goal = result.goal
  const yTicks = useMemo(() => {
    let top = Math.max(...bands.high, baseline ? Math.max(...baseline) : 0, goal && !goal.outsidePlan ? goal.amount : 0)
    if (showPaths) for (const p of paths) top = Math.max(top, ...p)
    return moneyTicks(top)
  }, [bands, baseline, goal, paths, showPaths])
  const ticks = useMemo(() => yearTicks(result.startDay, result.endDay), [result])
  const labels = percentileLabels(result.percentiles)
  const detailPhases = result.median.detail.phases
  const total = result.endDay - result.startDay
  const real = result.switches.inflation

  return (
    <figure className="growth-figure fan-figure">
      <div className="chart-box">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 12, right: RIGHT_GAP, bottom: 0, left: 0 }}>
            {detailPhases.map((p, i) =>
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
              allowDataOverflow
            />
            <Tooltip
              content={(props) => <FanTooltip {...(props as TooltipContentProps<number, string>)} currency={currency} labels={labels} />}
              cursor={{ stroke: 'var(--ink-3)', strokeWidth: 1 }}
              isAnimationActive={false}
            />
            <Area type="monotone" dataKey="outer" stroke="none" fill="var(--fan)" fillOpacity={0.13} isAnimationActive={false} activeDot={false} />
            <Area type="monotone" dataKey="inner" stroke="none" fill="var(--fan)" fillOpacity={0.2} isAnimationActive={false} activeDot={false} />
            {showPaths &&
              paths.map((_, i) => (
                <Line key={i} type="linear" dataKey={`p${i}`} stroke="var(--fan-path)" strokeWidth={1.25} strokeOpacity={0.85} dot={false} activeDot={false} isAnimationActive={false} />
              ))}
            <Line type="monotone" dataKey="high" stroke="var(--fan)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} activeDot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="low" stroke="var(--fan)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} activeDot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="mid" stroke="var(--fan)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
            {baseline && <Line type="monotone" dataKey="baseline" stroke="var(--ink-2)" strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={false} isAnimationActive={false} />}
            {goal && !goal.outsidePlan && (
              <ReferenceDot
                x={goal.day + 1}
                y={goal.amount}
                r={5}
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
        {detailPhases.map((p, i) => {
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

      <ul className="fan-legend" aria-hidden="true">
        <li>
          <span className="fan-key fan-key-edge" /> {labels[2]}
        </li>
        <li>
          <span className="fan-key fan-key-mid" /> {labels[1]}
        </li>
        <li>
          <span className="fan-key fan-key-edge" /> {labels[0]}
        </li>
        {showPaths && (
          <li>
            <span className="fan-key fan-key-path" /> Single simulations
          </li>
        )}
        {baseline && (
          <li>
            <span className="key key-baseline" /> All switches off
          </li>
        )}
      </ul>
      <figcaption className="visually-hidden">
        Fan chart of your balance over time{real ? ' in today’s dollars' : ''} across {result.runs.toLocaleString('en-AU')} simulations: the {labels[1]} line in the middle, with {labels[0]} and{' '}
        {labels[2]} lines and shading between them, from {dateLong(result.startDay)} to {dateLong(result.endDay - 1)}.
      </figcaption>
    </figure>
  )
}

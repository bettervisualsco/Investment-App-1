import { useMemo, useState } from 'react'
import { Area, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts'
import { Segmented, Select } from '../components/inputs'
import { pct, pctTicks, RIGHT_GAP, TOP_GAP, Y_AXIS_WIDTH, yearTicks } from './chartBits'
import { chainEnd, COUNTRY_NAME, monthLabel, type Country, type MonthlyChain } from './cpi'
import { PREDICTION_RUNS } from './predict'
import { getPrediction } from './predictionCache'
import { historicalAverage, windowMonths, windowYears, WINDOW_OPTIONS, type WindowChoice, type WindowKey } from './window'
import { Tip } from './Tip'

type Horizon = '1' | '5' | '10' | '20' | '30'
type View = 'yearly' | 'average'

interface Row {
  m: number
  actual?: number
  mid?: number
  low?: number
  high?: number
  range?: [number, number]
}

function PredictionTip({ active, payload, view }: TooltipContentProps<number, string> & { view: View }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload as Row
  return (
    <div className="chart-tip">
      <div className="chart-tip-date">{monthLabel(row.m)}</div>
      {row.actual !== undefined && (
        <div className="chart-tip-row">
          <span className="key infl-key-actual" aria-hidden="true" />
          Actual, year to then <strong>{pct(row.actual / 100)}</strong>
        </div>
      )}
      {row.mid !== undefined && (
        <>
          <div className="chart-tip-row infl-tip-sub">{view === 'yearly' ? 'Yearly inflation (estimate)' : 'Average a year from now (estimate)'}</div>
          <div className="chart-tip-row">
            Worst (high) <strong>{pct(row.high! / 100)}</strong>
          </div>
          <div className="chart-tip-row">
            <span className="key infl-key-mid" aria-hidden="true" />
            Likely <strong>{pct(row.mid / 100)}</strong>
          </div>
          <div className="chart-tip-row">
            Best (low) <strong>{pct(row.low! / 100)}</strong>
          </div>
        </>
      )}
    </div>
  )
}

/** Worst / likely / best fan chart for future inflation, replaying real history. */
export function PredictionSection({ chains, choice, setChoice }: { chains: Record<Country, MonthlyChain>; choice: WindowChoice; setChoice: (c: WindowChoice) => void }) {
  const [country, setCountry] = useState<Country>('au')
  const [horizon, setHorizon] = useState<Horizon>('10')
  const [view, setView] = useState<View>('yearly')
  const chain = chains[country]
  const pred = useMemo(() => getPrediction(chain, choice), [chain, choice])
  const end = chainEnd(chain)
  const months = Number(horizon) * 12
  const band = view === 'yearly' ? pred.yearly : pred.average

  const rows: Row[] = useMemo(() => {
    const out: Row[] = []
    const back = Math.max(24, Math.min(months, 120))
    // the real yearly figure for each recent month, from the same monthly series the replay uses
    for (let m = Math.max(chain.start + 11, end - back); m <= end; m++) {
      const lv = chain.levels[m - chain.start]
      const before = m - 12 >= chain.start ? chain.levels[m - 12 - chain.start] : chain.base
      out.push({ m, actual: (lv / before - 1) * 100 })
    }
    for (let k = 0; k <= months; k++) {
      const low = band.low[k] * 100
      const high = band.high[k] * 100
      const row: Row = { m: end + k, mid: band.mid[k] * 100, low, high, range: [low, high] }
      if (k === 0) Object.assign(out[out.length - 1], row)
      else out.push(row)
    }
    return out
  }, [chain, end, months, band])

  const x0 = rows[0].m
  const x1 = rows[rows.length - 1].m
  const yTicks = useMemo(() => {
    const vals = rows.flatMap((r) => [r.actual, r.low, r.high].filter((v): v is number => v !== undefined))
    return pctTicks(Math.min(...vals, 0), Math.max(...vals, 3.5))
  }, [rows])

  const avg = { low: pred.average.low[months], mid: pred.average.mid[months], high: pred.average.high[months] }
  const oneYear = { low: pred.yearly.low[months], high: pred.yearly.high[months] }
  const { from, to } = windowMonths(choice, chain)
  const planner = historicalAverage(chains.au, choice)
  const years = Array.from({ length: Math.floor(end / 12) - Math.floor(chain.start / 12) + 1 }, (_, i) => String(Math.floor(chain.start / 12) + i))
  const target = country === 'au' ? { y1: 2, y2: 3 } : null

  return (
    <section className="block infl-block" aria-labelledby="infl-pred-title">
      <div className="block-head">
        <h2 id="infl-pred-title">
          Inflation ahead: an estimate <Tip term="prediction" />
        </h2>
        <p className="block-hint">Based on replaying real history {Math.floor(from / 12)}–{Math.floor(to / 12)}, not a forecast. The future can be different.</p>
      </div>

      <div className="infl-controls">
        <Segmented<Country>
          label="Country"
          value={country}
          onChange={setCountry}
          options={[
            { value: 'au', label: 'Australia' },
            { value: 'us', label: 'US' },
          ]}
        />
        <Segmented<Horizon>
          label="Years ahead"
          value={horizon}
          onChange={setHorizon}
          options={(['1', '5', '10', '20', '30'] as Horizon[]).map((h) => ({ value: h, label: `${h}Y` }))}
        />
      </div>

      <div className="infl-tiles">
        <div className="infl-tile">
          <div className="infl-tile-label">Likely</div>
          <div className="infl-tile-value">{pct(avg.mid)}</div>
          <div className="infl-tile-sub">a year on average</div>
        </div>
        <div className="infl-tile">
          <div className="infl-tile-label">Worst (high)</div>
          <div className="infl-tile-value">{pct(avg.high)}</div>
          <div className="infl-tile-sub">a year on average</div>
        </div>
        <div className="infl-tile">
          <div className="infl-tile-label">Best (low)</div>
          <div className="infl-tile-value">{pct(avg.low)}</div>
          <div className="infl-tile-sub">a year on average</div>
        </div>
      </div>
      <p className="infl-summary">
        Over the next {horizon === '1' ? 'year' : `${horizon} years`}, {COUNTRY_NAME[country]}’s prices might rise by about {pct(avg.mid)} a year on average, based on history{' '}
        {Math.floor(from / 12)}–{Math.floor(to / 12)}. In 8 out of 10 simulated futures it was between {pct(avg.low)} and {pct(avg.high)} <Tip term="percentiles" />.
        {Number(horizon) > 1 && <> Any single year swings more: from {pct(oneYear.low)} to {pct(oneYear.high)}.</>}
      </p>

      <div className="infl-controls">
        <Segmented<View>
          label="What the chart shows"
          value={view}
          onChange={setView}
          options={[
            { value: 'yearly', label: 'Each year' },
            { value: 'average', label: 'Average from now' },
          ]}
        />
      </div>
      <div className="infl-legend" aria-hidden="true">
        <span>
          <span className="infl-swatch is-actual" />
          Actual
        </span>
        <span>
          <span className="infl-swatch is-mid" />
          Likely
        </span>
        <span>
          <span className="infl-swatch is-range" />
          Worst to best
        </span>
        {target ? (
          <span>
            <span className="infl-swatch is-band" />
            RBA target 2–3% <Tip term="rbaTarget" />
          </span>
        ) : (
          <span>
            <span className="infl-swatch is-goal" />
            Fed goal 2% <Tip term="rbaTarget" />
          </span>
        )}
      </div>

      <figure className="infl-figure">
        <div className="chart-box">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: TOP_GAP, right: RIGHT_GAP, bottom: 0, left: 0 }}>
              {target && <ReferenceArea y1={target.y1} y2={target.y2} fill="var(--target-band)" fillOpacity={1} strokeOpacity={0} ifOverflow="hidden" />}
              {!target && <ReferenceLine y={2} stroke="var(--ink-3)" strokeDasharray="2 4" />}
              <ReferenceLine y={0} stroke="var(--line-strong)" />
              <ReferenceLine x={end} stroke="var(--line-strong)" strokeDasharray="3 3" label={{ value: 'Now', position: 'insideTopLeft', fill: 'var(--ink-3)', fontSize: 12 }} />
              <XAxis
                dataKey="m"
                type="number"
                domain={[x0, x1]}
                ticks={yearTicks(x0, x1)}
                tickFormatter={(m: number) => String(Math.floor(m / 12))}
                tick={{ fill: 'var(--ink-3)', fontSize: 12 }}
                tickLine={false}
                axisLine={{ stroke: 'var(--line)' }}
              />
              <YAxis
                width={Y_AXIS_WIDTH}
                ticks={yTicks}
                domain={[yTicks[0], yTicks[yTicks.length - 1]]}
                tickFormatter={(v: number) => `${v}%`}
                tick={{ fill: 'var(--ink-3)', fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                allowDataOverflow
              />
              <Tooltip content={(props) => <PredictionTip {...(props as TooltipContentProps<number, string>)} view={view} />} cursor={{ stroke: 'var(--ink-3)', strokeWidth: 1 }} isAnimationActive={false} />
              <Area dataKey="range" type="monotone" stroke="none" fill="var(--series-infl)" fillOpacity={0.2} isAnimationActive={false} activeDot={false} />
              <Line dataKey="high" type="monotone" stroke="var(--series-infl)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} activeDot={false} isAnimationActive={false} />
              <Line dataKey="low" type="monotone" stroke="var(--series-infl)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} activeDot={false} isAnimationActive={false} />
              <Line dataKey="mid" type="monotone" stroke="var(--series-infl)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
              <Line dataKey="actual" type="monotone" stroke="var(--ink-2)" strokeWidth={2} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <figcaption className="visually-hidden">
          Fan chart of estimated {view === 'yearly' ? 'yearly inflation' : 'average yearly inflation from now'} for {COUNTRY_NAME[country]} over the next {horizon} years: likely {pct(avg.mid)}, worst {pct(avg.high)}, best{' '}
          {pct(avg.low)} a year on average.
        </figcaption>
      </figure>
      <p className="fine-print">
        {view === 'yearly'
          ? 'Each year: inflation over the 12 months to each date. The first year still includes real recent months, so it starts from today’s figure.'
          : 'Average from now: the average yearly inflation from today up to each date. Longer periods average out the ups and downs, so the range narrows.'}{' '}
        {PREDICTION_RUNS.toLocaleString('en-AU')} simulated futures, built from random 12-month chunks of real monthly inflation. The same data always gives the same answer.
      </p>

      <div className="sub-head">
        Which years to learn from <Tip term="historyWindow" />
      </div>
      <div className="infl-window-pick">
        <label>
          <span>History</span>
          <Select<WindowKey>
            label="History to learn from"
            value={choice.key}
            onChange={(key) => setChoice(key === 'custom' ? { key, from: Math.floor(from / 12), to: Math.floor(to / 12) } : { key })}
            options={WINDOW_OPTIONS}
          />
        </label>
        {choice.key === 'custom' && (
          <>
            <label>
              <span>From</span>
              <Select label="First year" value={String(choice.from ?? Math.floor(from / 12))} onChange={(v) => setChoice({ ...choice, from: Number(v) })} options={years.map((y) => ({ value: y, label: y }))} />
            </label>
            <label>
              <span>To</span>
              <Select label="Last year" value={String(choice.to ?? Math.floor(to / 12))} onChange={(v) => setChoice({ ...choice, to: Number(v) })} options={years.map((y) => ({ value: y, label: y }))} />
            </label>
          </>
        )}
      </div>
      <p className="block-hint infl-window-note">
        Using {COUNTRY_NAME[country]} {windowYears(choice, chain)} ({monthLabel(from)} to {monthLabel(to)}). The Planner’s “Use historical average” button uses the same years for
        Australia: {planner.rate.toFixed(2)}% a year ({windowYears(choice, chains.au)}).
        {choice.key === 'full' && country === 'us' ? ' US full history goes back to 1871, including times of falling prices under the gold standard.' : ''}
      </p>
    </section>
  )
}

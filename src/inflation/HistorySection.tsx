import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts'
import { Segmented, Select } from '../components/inputs'
import type { InflationFile } from '../data/types'
import { COUNTRY_COLOR, pct, pctTicks, RIGHT_GAP, spanWords, TOP_GAP, Y_AXIS_WIDTH, yearTicks } from './chartBits'
import { COUNTRY_NAME, historyLevels, monthLabel, windowChange, yearlyInflation, type Country, type HistorySeries, type Levels, type YearlyPoint } from './cpi'
import { Tip } from './Tip'

type Show = 'au' | 'us' | 'both'
type Range = '1' | '5' | '10' | '20' | '50' | 'max'
const RANGES: { value: Range; label: string }[] = [
  { value: '1', label: '1Y' },
  { value: '5', label: '5Y' },
  { value: '10', label: '10Y' },
  { value: '20', label: '20Y' },
  { value: '50', label: '50Y' },
  { value: 'max', label: 'Max' },
]

interface Shown {
  country: Country
  levels: Levels
  yearly: YearlyPoint[]
}

/** Index of the CPI figure nearest to month m. */
function nearest(levels: Levels, m: number): number {
  let best = 0
  for (let i = 1; i < levels.points.length; i++) if (Math.abs(levels.points[i].m - m) < Math.abs(levels.points[best].m - m)) best = i
  return best
}

/** The latest point at or before month m (for the tooltip). */
function atOrBefore(points: YearlyPoint[], m: number): YearlyPoint | undefined {
  let lo = 0
  let hi = points.length - 1
  if (hi < 0 || points[0].m > m) return undefined
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (points[mid].m <= m) lo = mid
    else hi = mid - 1
  }
  return points[lo]
}

function HistoryTip({ active, label, shown }: TooltipContentProps<number, string> & { shown: Shown[] }) {
  if (!active || typeof label !== 'number') return null
  // each country's latest figure at or before this point (quarterly figures cover 3 months)
  const rows = shown.map((x) => ({ s: x, p: atOrBefore(x.yearly, label) })).filter((r) => r.p && label - r.p.m < (r.s.levels.freq === 'quarterly' ? 3 : 1))
  if (!rows.length) return null
  return (
    <div className="chart-tip">
      {rows.map(({ s, p }) => (
        <div key={s.country} className="chart-tip-row">
          <span className="key" style={{ background: COUNTRY_COLOR[s.country] }} aria-hidden="true" />
          {COUNTRY_NAME[s.country]}, year to {p!.label} <strong>{pct(p!.pct / 100)}</strong>
        </div>
      ))}
    </div>
  )
}

/** Historical yearly inflation for Australia and the US, with drag-to-highlight. */
export function HistorySection({ file }: { file: InflationFile }) {
  const [show, setShow] = useState<Show>('au')
  const [auSeries, setAuSeries] = useState<'au_q' | 'au_m'>('au_q')
  const [range, setRange] = useState<Range>('max')

  const shown: Shown[] = useMemo(() => {
    const list: { country: Country; which: HistorySeries }[] = []
    if (show !== 'us') list.push({ country: 'au', which: auSeries })
    if (show !== 'au') list.push({ country: 'us', which: 'us_m' })
    return list.map(({ country, which }) => {
      const levels = historyLevels(file, which)
      return { country, levels, yearly: yearlyInflation(levels) }
    })
  }, [file, show, auSeries])

  const dataStart = Math.min(...shown.map((x) => x.yearly[0]?.m ?? Infinity))
  const dataEnd = Math.max(...shown.map((x) => x.yearly.at(-1)?.m ?? -Infinity))
  const span = range === 'max' ? Infinity : Number(range) * 12
  const x0 = Math.max(dataStart, dataEnd - span)
  const x1 = dataEnd

  // Highlighted window, as month numbers. Default: since inflation targeting began (Dec qtr 1992 → latest).
  const [sel, setSel] = useState<{ a: number; b: number } | null>(null)
  const latestLevelM = Math.max(...shown.map((x) => x.levels.points.at(-1)!.m))
  const selection = sel ?? { a: 1992 * 12 + 11, b: latestLevelM }

  const rows = useMemo(() => {
    const byM = new Map<number, Record<string, number>>()
    for (const x of shown)
      for (const p of x.yearly) {
        if (p.m < x0 || p.m > x1) continue
        byM.set(p.m, { ...(byM.get(p.m) ?? { m: p.m }), [x.country]: p.pct })
      }
    return [...byM.values()].sort((a, b) => a.m - b.m)
  }, [shown, x0, x1])

  const yTicks = useMemo(() => {
    const vals = rows.flatMap((r) => shown.map((x) => r[x.country]).filter((v): v is number => v !== undefined))
    return pctTicks(Math.min(...vals, 0), Math.max(...vals, 3))
  }, [rows, shown])

  // ---- drag to highlight (touch: drag sideways; scrolling up and down still scrolls the page) ----
  const box = useRef<HTMLDivElement>(null)
  const drag = useRef<{ startX: number; startM: number; moved: boolean; id: number } | null>(null)
  const [live, setLive] = useState<{ a: number; b: number } | null>(null)
  const monthAt = (clientX: number) => {
    const rect = box.current!.getBoundingClientRect()
    const left = rect.left + Y_AXIS_WIDTH
    const width = rect.width - Y_AXIS_WIDTH - RIGHT_GAP
    const f = Math.min(1, Math.max(0, (clientX - left) / width))
    const m = Math.round(x0 + f * (x1 - x0))
    // with quarterly figures on show, snap to quarter ends so both countries cover the same months
    return shown.some((x) => x.levels.freq === 'quarterly') ? Math.round((m - 2) / 3) * 3 + 2 : m
  }
  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    drag.current = { startX: e.clientX, startM: monthAt(e.clientX), moved: false, id: e.pointerId }
  }
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    if (!d.moved && Math.abs(e.clientX - d.startX) < 8) return
    if (!d.moved) {
      d.moved = true
      box.current?.setPointerCapture(e.pointerId)
    }
    setLive({ a: d.startM, b: monthAt(e.clientX) })
  }
  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    drag.current = null
    if (!d || !d.moved) return
    const b = monthAt(e.clientX)
    setLive(null)
    if (Math.abs(b - d.startM) >= 1) setSel({ a: Math.min(d.startM, b), b: Math.max(d.startM, b) })
  }
  const onCancel = () => {
    drag.current = null
    setLive(null)
  }

  const area = live ? { a: Math.min(live.a, live.b), b: Math.max(live.a, live.b) } : selection
  const results = shown.map((x) => ({ x, change: windowChange(x.levels, nearest(x.levels, area.a), nearest(x.levels, area.b)) }))

  // year pickers (the same window, by year)
  const firstYear = Math.floor(Math.min(...shown.map((x) => x.levels.points[0].m)) / 12) + 1
  const lastYear = Math.floor(latestLevelM / 12)
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, i) => String(firstYear + i))
  const fromYear = String(Math.min(lastYear, Math.max(firstYear, Math.floor((selection.a + 1) / 12))))
  const toYear = String(Math.min(lastYear, Math.max(firstYear, Math.floor(selection.b / 12))))
  const pickYears = (from: number, to: number) => {
    const [lo, hi] = from <= to ? [from, to] : [to, from]
    setSel({ a: lo * 12 - 1, b: Math.min(latestLevelM, hi * 12 + 11) })
  }

  const auNote =
    show !== 'us' &&
    (auSeries === 'au_q'
      ? 'Australia: ABS quarterly CPI since 1948. Each point is the rise over the 12 months to that quarter.'
      : `Australia: ABS complete Monthly CPI. It started in April 2024, so its yearly figures start in April 2025.`)

  return (
    <section className="block infl-block" aria-labelledby="infl-history-title">
      <div className="block-head">
        <h2 id="infl-history-title">
          Inflation history <Tip term="yearlyInflation" />
        </h2>
        <p className="block-hint">Yearly inflation: how much prices rose over the 12 months to each date.</p>
      </div>

      <div className="infl-controls">
        <Segmented<Show>
          label="Country"
          value={show}
          onChange={setShow}
          options={[
            { value: 'au', label: 'Australia' },
            { value: 'us', label: 'US' },
            { value: 'both', label: 'Both' },
          ]}
        />
        {show !== 'us' && (
          <span className="infl-inline">
            <Segmented<'au_q' | 'au_m'>
              label="Australian CPI"
              value={auSeries}
              onChange={setAuSeries}
              options={[
                { value: 'au_q', label: 'Quarterly' },
                { value: 'au_m', label: 'Monthly' },
              ]}
            />
            <Tip term="quarterlyMonthly" />
          </span>
        )}
      </div>
      <div className="infl-controls">
        <Segmented<Range>
          label="Time range"
          value={range}
          onChange={setRange}
          options={RANGES.map((r) => ({ ...r, disabled: r.value !== 'max' && dataEnd - dataStart < (Number(r.value) * 12) / 2 }))}
        />
      </div>

      {show === 'both' && (
        <div className="infl-legend" aria-hidden="true">
          {shown.map((x) => (
            <span key={x.country}>
              <span className="infl-swatch" style={{ background: COUNTRY_COLOR[x.country] }} />
              {COUNTRY_NAME[x.country]}
            </span>
          ))}
        </div>
      )}

      <figure className="infl-figure">
        <div
          ref={box}
          className="chart-box infl-drag"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onCancel}
          onLostPointerCapture={() => live && onCancel()}
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: TOP_GAP, right: RIGHT_GAP, bottom: 0, left: 0 }}>
              {show !== 'us' && <ReferenceArea y1={2} y2={3} fill="var(--target-band)" fillOpacity={1} strokeOpacity={0} ifOverflow="hidden" />}
              <ReferenceArea x1={Math.max(area.a, x0)} x2={Math.min(area.b, x1)} fill="var(--accent)" fillOpacity={0.12} stroke="var(--accent)" strokeOpacity={0.5} ifOverflow="hidden" />
              <ReferenceLine y={0} stroke="var(--line-strong)" />
              <XAxis
                dataKey="m"
                type="number"
                domain={[x0, x1]}
                ticks={yearTicks(x0, x1)}
                tickFormatter={(m: number) => String(Math.floor(m / 12))}
                tick={{ fill: 'var(--ink-3)', fontSize: 12 }}
                tickLine={false}
                axisLine={{ stroke: 'var(--line)' }}
                allowDataOverflow
              />
              <YAxis
                width={Y_AXIS_WIDTH}
                ticks={yTicks}
                domain={[yTicks[0], yTicks[yTicks.length - 1]]}
                tickFormatter={(v: number) => `${v}%`}
                tick={{ fill: 'var(--ink-3)', fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={(props) => <HistoryTip {...(props as TooltipContentProps<number, string>)} shown={shown} />} cursor={{ stroke: 'var(--ink-3)', strokeWidth: 1 }} isAnimationActive={false} />
              {[...shown].reverse().map((x) => (
                <Line key={x.country} dataKey={x.country} type="linear" stroke={COUNTRY_COLOR[x.country]} strokeWidth={x.yearly.length > 600 && range === 'max' ? 1.5 : 2} dot={false} connectNulls isAnimationActive={false} />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <figcaption className="visually-hidden">
          Line chart of yearly inflation for {shown.map((x) => COUNTRY_NAME[x.country]).join(' and ')} from {monthLabel(x0)} to {monthLabel(x1)}
          {show !== 'us' ? ', with the RBA’s 2–3% target shaded' : ''}. The table “Year by year” below has the December figures.
        </figcaption>
      </figure>
      <p className="infl-drag-hint">
        Drag across the chart to highlight a period <Tip term="highlight" />
        {show !== 'us' && (
          <>
            {' '}
            · <span className="infl-swatch is-band" aria-hidden="true" /> RBA target 2–3% <Tip term="rbaTarget" />
          </>
        )}
      </p>

      <div className="infl-window">
        <div className="infl-window-pick">
          <label>
            <span>From</span>
            <Select label="From the start of year" value={fromYear} onChange={(v) => pickYears(Number(v), Number(toYear))} options={years.map((y) => ({ value: y, label: y }))} />
          </label>
          <label>
            <span>To</span>
            <Select
              label="To the end of year"
              value={toYear}
              onChange={(v) => pickYears(Number(fromYear), Number(v))}
              options={years.map((y) => ({ value: y, label: y }))}
            />
          </label>
        </div>
        {results.map(({ x, change }) => (
          <div key={x.country} className="infl-result" aria-live="polite">
            {change ? (
              <>
                <div className="infl-result-big">
                  {show === 'both' && <span className="infl-swatch" style={{ background: COUNTRY_COLOR[x.country] }} aria-hidden="true" />}
                  {pct(change.yearly, 2)} <span>a year</span>
                </div>
                <p>
                  {COUNTRY_NAME[x.country]}: prices rose {pct(change.total, change.total > 1 ? 0 : 1)} from {change.from.label} to {change.to.label} ({spanWords(change.months)}). That’s an
                  average of {pct(change.yearly, 2)} a year, compounded <Tip term="compoundAverage" />
                  {change.months < 12 ? ' (the pace over less than a year, scaled up to a year)' : ''}.
                </p>
              </>
            ) : (
              <p>Pick a longer period.</p>
            )}
          </div>
        ))}
      </div>

      {auNote && <p className="fine-print">{auNote}</p>}
      {show !== 'au' && <p className="fine-print">US: CPI for all urban consumers (BLS) since 1913, and older price records (Shiller) back to 1871. October 2025 was never published (US government shutdown).</p>}

      <YearTable shown={shown} />
    </section>
  )
}

/** The December (or Dec quarter) figure for each year, newest first: a table view of the chart. */
function YearTable({ shown }: { shown: Shown[] }) {
  const years = new Map<number, Partial<Record<Country, number>>>()
  for (const x of shown)
    for (const p of x.yearly)
      if (p.m % 12 === 11) {
        const y = Math.floor(p.m / 12)
        years.set(y, { ...years.get(y), [x.country]: p.pct })
      }
  const list = [...years.entries()].sort((a, b) => b[0] - a[0])
  if (!list.length) return null
  return (
    <details className="infl-table-block">
      <summary>Year by year (to December)</summary>
      <div className="table-scroll">
        <table className="year-table infl-year-table">
          <thead>
            <tr>
              <th scope="col">Year</th>
              {shown.map((x) => (
                <th key={x.country} scope="col">
                  {COUNTRY_NAME[x.country]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map(([y, v]) => (
              <tr key={y}>
                <th scope="row">{y}</th>
                {shown.map((x) => (
                  <td key={x.country}>{v[x.country] === undefined ? '—' : pct(v[x.country]! / 100)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

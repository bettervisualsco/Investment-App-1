// Compare: two or more ETFs (or indexes) on one chart, as % growth from the same starting day.

import { useMemo, useState } from 'react'
import { LineStyle, type Time } from 'lightweight-charts'
import { useChartColors } from './colors'
import { dayText, pctText, rateText } from './format'
import { timeISO } from './chartTime'
import { MarketChart, type ChartLine } from './MarketChart'
import { averageYearly, daysBetween, indexOnOrBefore, RANGES, rangeStartDate, type RangeKey } from './maths'
import { usePrefs } from './prefs'
import { shortName, useDailyMany, useEtfs, useFx, useMarketFreshness } from './useMarketData'
import { categoryOf, CATEGORY_ORDER } from './watchlist'
import { Tip, Toggle } from './words'

export const MAX_COMPARE = 5
// A second cue besides colour: each line has its own dash pattern.
const STYLES = [LineStyle.Solid, LineStyle.Dashed, LineStyle.Dotted, LineStyle.LargeDashed, LineStyle.SparseDotted]
const DASH = ['', '6 4', '1.5 3', '10 5', '1.5 6']

interface Prepared {
  id: string
  name: string
  dates: string[]
  values: number[]
}

export function ComparePage({ onBack, onOpen }: { onBack: () => void; onOpen: (id: string) => void }) {
  const { etfs, indexes, byId } = useEtfs()
  const [prefs, setPrefs] = usePrefs()
  const colors = useChartColors()
  const fresh = useMarketFreshness('asx')
  const chosen = useMemo(() => prefs.compare.filter((id) => byId.has(id)).slice(0, MAX_COMPARE), [prefs.compare, byId])
  const daily = useDailyMany(chosen)
  const { rate } = useFx()
  const range: RangeKey = prefs.compareRange === '1D' ? '1Y' : prefs.compareRange
  const [hover, setHover] = useState<{ time: Time; values: Record<string, number> } | null>(null)

  const anyUsd = chosen.some((id) => byId.get(id)?.currency === 'USD' && byId.get(id)?.kind !== 'fx')
  const anyEtf = chosen.some((id) => byId.get(id)?.kind === 'etf')

  const prepared: Prepared[] = useMemo(() => {
    const out: Prepared[] = []
    for (const id of chosen) {
      const d = daily.get(id)
      const item = byId.get(id)
      if (!d || !item) continue
      const vals = item.kind === 'etf' && prefs.totalReturn ? d.rows.adj : d.rows.close
      const convert = prefs.inAud && item.currency === 'USD' && item.kind !== 'fx' && rate
      if (!convert) {
        out.push({ id, name: item.name, dates: d.rows.dates, values: vals })
        continue
      }
      const p: Prepared = { id, name: item.name, dates: [], values: [] }
      d.rows.dates.forEach((day, i) => {
        const fx = rate(day)
        if (!fx) return
        p.dates.push(day)
        p.values.push(vals[i] / fx)
      })
      out.push(p)
    }
    return out
  }, [chosen, daily, byId, prefs.totalReturn, prefs.inAud, rate])

  // Everyone starts on the same day: the range start, or the youngest fund's first day.
  const common = useMemo(() => {
    if (prepared.length === 0) return null
    const last = prepared.reduce((m, p) => (p.dates.at(-1)! > m ? p.dates.at(-1)! : m), '')
    const rs = rangeStartDate(range, last)
    const youngest = prepared.reduce((m, p) => (p.dates[0] > m ? p.dates[0] : m), '')
    return { start: rs && rs > youngest ? rs : youngest, last, limitedBy: rs && rs > youngest ? null : prepared.find((p) => p.dates[0] === youngest)?.id ?? null }
  }, [prepared, range])

  const result = useMemo(() => {
    if (!common) return []
    return prepared.map((p, k) => {
      const base = Math.max(0, indexOnOrBefore(p.dates, common.start))
      const b = p.values[base]
      const points = p.dates.slice(base).map((d, i) => ({ time: d as Time, value: p.values[base + i] / b - 1 }))
      const end = p.values[p.values.length - 1]
      return {
        id: p.id,
        name: p.name,
        color: colors.compare[k % colors.compare.length],
        style: STYLES[k % STYLES.length],
        dash: DASH[k % DASH.length],
        points,
        growth: end / b - 1,
        yearly: averageYearly(b, end, daysBetween(p.dates[base], p.dates[p.dates.length - 1])),
        from: p.dates[base],
      }
    })
  }, [prepared, common, colors])

  const lines: ChartLine[] = useMemo(() => result.map((r) => ({ id: r.id, points: r.points, color: r.color, kind: 'line', style: r.style, width: 2, title: shortName(r.id) })), [result])
  const visible = useMemo(() => (common ? { from: common.start as Time, to: common.last as Time } : null), [common])

  const toggle = (id: string) =>
    setPrefs((p) => {
      if (p.compare.includes(id)) return { compare: p.compare.filter((x) => x !== id) }
      if (p.compare.length >= MAX_COMPARE) return {}
      return { compare: [...p.compare, id] }
    })

  // The picker in the same groups as the dashboard, then the indexes.
  const groups = useMemo(() => {
    const byCat = new Map<string, { id: string; name: string }[]>()
    for (const e of etfs) {
      const c = categoryOf(e)
      byCat.set(c, [...(byCat.get(c) ?? []), { id: e.id, name: e.name }])
    }
    const order = [...CATEGORY_ORDER.filter((c) => byCat.has(c)), ...[...byCat.keys()].filter((c) => !(CATEGORY_ORDER as readonly string[]).includes(c)).sort()]
    const out = order.map((c) => ({ title: c, items: byCat.get(c)! }))
    if (indexes.length) out.push({ title: 'Indexes and AUD/USD', items: indexes.map((i) => ({ id: i.id, name: i.name })) })
    return out
  }, [etfs, indexes])
  const chartHeight = typeof window !== 'undefined' && window.matchMedia('(min-width: 900px)').matches ? 420 : 300

  return (
    <div className="mk-page">
      <button type="button" className="btn btn-quiet mk-back" onClick={onBack}>
        ‹ Markets
      </button>
      <header className="mk-head">
        <h1>Compare</h1>
        <p className="mk-head-name">How much each one grew, from the same starting day.</p>
        <p className="mk-fresh">{fresh.label}</p>
      </header>

      <section className="block">
        <div className="block-head">
          <h2>Pick 2 to {MAX_COMPARE}</h2>
        </div>
        {groups.map((g) => (
          <div key={g.title} className="mk-chip-group">
            <h3 className="mk-list-head">{g.title}</h3>
            <div className="mk-chips" role="group" aria-label={`${g.title} to compare`}>
              {g.items.map((a) => {
                const on = chosen.includes(a.id)
                return (
                  <button key={a.id} type="button" className={`mk-chip${on ? ' is-on' : ''}`} aria-pressed={on} disabled={!on && chosen.length >= MAX_COMPARE} title={a.name} onClick={() => toggle(a.id)}>
                    {shortName(a.id)}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </section>

      <section className="block mk-chart-block">
        <div className="mk-ranges" role="radiogroup" aria-label="Chart range">
          {RANGES.filter((r) => r !== '1D').map((r) => (
            <button key={r} type="button" role="radio" aria-checked={range === r} className={range === r ? 'is-on' : undefined} onClick={() => setPrefs({ compareRange: r })}>
              {r}
            </button>
          ))}
        </div>
        {result.length < 2 ? (
          <div className="mk-chart-empty" style={{ height: chartHeight }}>
            {chosen.length < 2 ? 'Pick at least two above.' : 'Loading…'}
          </div>
        ) : (
          <MarketChart
            key="compare"
            lines={lines}
            visible={visible}
            timeKind="day"
            formatValue={(v) => pctText(v, 1)}
            colors={colors}
            height={chartHeight}
            label={`Growth of ${result.map((r) => shortName(r.id)).join(', ')}`}
            onCrosshair={(t, values) => setHover(t ? { time: t, values } : null)}
          />
        )}
        <div className="mk-toggles">
          {anyEtf && <Toggle label="Total return (with distributions)" checked={prefs.totalReturn} onChange={(on) => setPrefs({ totalReturn: on })} info="totalReturn" />}
          {anyUsd && <Toggle label="Show US-listed in Australian dollars" checked={prefs.inAud} onChange={(on) => setPrefs({ inAud: on })} info="inAud" />}
        </div>

        {result.length >= 2 && common && (
          <>
            <p className="mk-period">
              {hover && timeISO(hover.time) ? `On ${dayText(timeISO(hover.time) as string)}` : `${dayText(common.start)} to ${dayText(common.last)}`}
            </p>
            <ul className="mk-legend">
              {result.map((r) => (
                <li key={r.id}>
                  <svg width="28" height="10" aria-hidden="true">
                    <line x1="1" x2="27" y1="5" y2="5" stroke={r.color} strokeWidth="2.5" strokeDasharray={r.dash} strokeLinecap="round" />
                  </svg>
                  <button type="button" className="mk-legend-name" onClick={() => onOpen(r.id)}>
                    <strong>{shortName(r.id)}</strong>
                    <span>{r.name}</span>
                  </button>
                  <strong className="mk-legend-value">{pctText(hover ? hover.values[r.id] ?? NaN : r.growth, 1)}</strong>
                  {!hover && <span className="mk-legend-yearly">{rateText(r.yearly)} a year</span>}
                </li>
              ))}
            </ul>
            <p className="block-hint">
              {common.limitedBy ? `Starts ${dayText(common.start)}, when ${shortName(common.limitedBy)} began. ` : ''}
              {prefs.totalReturn && anyEtf ? 'ETFs include distributions; indexes are price only. ' : 'Price only (no distributions). '}
              {prefs.totalReturn &&
                (() => {
                  // ETFs whose distribution records start after this period begins: their total return is too low there.
                  const short = chosen.filter((id) => byId.get(id)?.kind === 'etf' && (daily.get(id)?.file.trFrom ?? '') > common.start)
                  return short.length
                    ? `No distribution records for ${short.map((id) => `${shortName(id)} before ${dayText(daily.get(id)!.file.trFrom!)}`).join(', ')}, so total return there is the price only (too low). `
                    : ''
                })()}
              Average a year is compound <Tip term="averageYearly" />. Past growth is history, not a promise.
            </p>
          </>
        )}
      </section>
      <p className="mk-attrib">
        Charts by{' '}
        <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">
          TradingView Lightweight Charts™
        </a>
        . Copyright (c) 2025 TradingView, Inc. Prices from Yahoo Finance, delayed about 15–20 minutes.
      </p>
    </div>
  )
}

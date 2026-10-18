// One ETF (or index): a big chart with ranges from 1 day to its whole life, price or total return,
// US$ or A$, prediction lines, the history puller ("Use in Planner") and key facts.

import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { LineStyle, type Time, type UTCTimestamp } from 'lightweight-charts'
import { Segmented } from '../components/inputs'
import { useDataFile, type MonthlyFile } from '../data'
import type { Plan } from '../engine/types'
import { ChangePill, MarketBadge } from './bits'
import { useChartColors, withAlpha } from './colors'
import { dayText, monthText, priceText, rateText } from './format'
import { KeyFacts } from './KeyFacts'
import { timeISO } from './chartTime'
import { MarketChart, type ChartLine } from './MarketChart'
import { addDaysISO, addMonthsISO, change, indexOnOrBefore, periodStats, RANGES, rangeStartIndex, type RangeKey } from './maths'
import { HORIZONS, predictLines, yearlyFromMultiplier, type Horizon } from './predict'
import { usePrefs } from './prefs'
import { intradayPoints, latestQuote } from './quotes'
import { UseInPlanner, type HistoryWindowRequest } from './UseInPlanner'
import { exchangeOf, unitOf, useDaily, useEtfs, useFx, useIntraday, useMarketFreshness, useMinute } from './useMarketData'
import { Tip, Toggle } from './words'

const wide = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 900px)').matches
const coarsePointer = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

const rangeWords: Record<RangeKey, string> = {
  '1D': 'today',
  '1W': 'past week',
  '1M': 'past month',
  '3M': 'past 3 months',
  '6M': 'past 6 months',
  YTD: 'this year',
  '1Y': 'past year',
  '5Y': 'past 5 years',
  '10Y': 'past 10 years',
  Max: 'since the start',
}

/** Weekdays after `from` up to `to`: blank points that keep the future part of the chart to scale. */
function weekdaysAfter(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = addDaysISO(from, 1); d <= to; d = addDaysISO(d, 1)) {
    const w = new Date(`${d}T12:00:00Z`).getUTCDay()
    if (w !== 0 && w !== 6) out.push(d)
  }
  return out
}

export function EtfDetail({
  id,
  onBack,
  plan,
  setPlan,
  onUseHistoryWindow,
}: {
  id: string
  onBack: () => void
  plan: Plan | null
  setPlan: Dispatch<SetStateAction<Plan | null>>
  onUseHistoryWindow?: (req: HistoryWindowRequest) => void
}) {
  const { byId, loading: infoLoading } = useEtfs()
  const item = byId.get(id)
  const etf = item?.kind === 'etf' ? item : null
  const [prefs, setPrefs] = usePrefs()
  const colors = useChartColors()
  const now = useMinute()
  const { daily, loading } = useDaily(id)
  const market = item?.market ?? 'asx'
  const intraday = useIntraday(market)
  const freshness = useMarketFreshness(market)
  const monthly = useDataFile<MonthlyFile>('monthly.json').data
  const { rate } = useFx()

  const usd = item?.currency === 'USD' && item.kind !== 'fx'
  const convert = usd && prefs.inAud && !!rate
  const total = !!etf && prefs.totalReturn
  const unit = unitOf(item, convert)
  const range = prefs.range
  const [sel, setSel] = useState<{ from: string; to: string } | null>(null)
  const [picking, setPicking] = useState(false)
  const [sheet, setSheet] = useState(false)
  const [hover, setHover] = useState<{ time: Time; value: number } | null>(null)

  const quote = useMemo(() => latestQuote(daily?.rows, intraday, id), [daily, intraday, id])

  // The day-by-day series shown: price or total return, US$ or A$, with today's latest price added.
  const series = useMemo(() => {
    if (!daily) return null
    const r = daily.rows
    const dates = [...r.dates]
    const price = [...r.close]
    const tr = [...r.adj]
    if (quote?.source === 'intraday' && intraday) {
      const n = r.close.length
      dates.push(intraday.session)
      price.push(quote.price)
      tr.push(n ? (r.adj[n - 1] * quote.price) / r.close[n - 1] : quote.price)
    }
    if (!convert || !rate) return { dates, price, total: tr }
    const out = { dates: [] as string[], price: [] as number[], total: [] as number[] }
    dates.forEach((d, i) => {
      const fx = rate(d)
      if (!fx) return
      out.dates.push(d)
      out.price.push(price[i] / fx)
      out.total.push(tr[i] / fx)
    })
    return out
  }, [daily, quote, intraday, convert, rate])

  const shown = series ? (total ? series.total : series.price) : null
  const points = useMemo(() => (series && shown ? series.dates.map((d, i) => ({ time: d as Time, value: shown[i] })) : []), [series, shown])
  const lastDate = series?.dates.at(-1) ?? ''
  const lastValue = shown?.at(-1) ?? NaN
  const startIdx = series ? rangeStartIndex(series.dates, range) : 0

  // 1D: today's 5-minute prices.
  const intra = useMemo(() => {
    const pts = intradayPoints(intraday, id)
    if (!pts.length || !intraday) return null
    const fx = convert && rate ? rate(intraday.session) : null
    if (convert && !fx) return null
    return {
      session: intraday.session,
      points: pts.map((p) => ({ time: p.time as UTCTimestamp as Time, value: fx ? p.value / fx : p.value })),
      prev: quote ? (fx ? quote.prev / fx : quote.prev) : null,
    }
  }, [intraday, id, convert, rate, quote])

  // Prediction lines from today's value.
  const showPredict = !!etf && !!monthly?.etfs[id] && prefs.predictions && range !== '1D' && Number.isFinite(lastValue)
  const predict = useMemo(() => {
    if (!showPredict || !monthly) return null
    try {
      const p = predictLines({ monthly, etfId: id, years: prefs.horizon, inAud: usd && convert, priceOnlyYield: total ? undefined : etf?.yield?.value ?? 0 })
      const times = Array.from({ length: p.months + 1 }, (_, k) => addMonthsISO(lastDate, k))
      const at = (arr: Float64Array) => times.map((t, k) => ({ time: t as Time, value: lastValue * arr[k] }))
      return {
        p,
        worst: at(p.worst),
        likely: at(p.likely),
        best: at(p.best),
        band: times.map((t, k) => ({ time: t as Time, upper: lastValue * p.best[k], lower: lastValue * p.worst[k] })),
        whitespace: weekdaysAfter(lastDate, times[times.length - 1]) as Time[],
        end: times[times.length - 1],
      }
    } catch {
      return null
    }
  }, [showPredict, monthly, id, prefs.horizon, usd, convert, total, etf, lastDate, lastValue])

  const lines: ChartLine[] = useMemo(() => {
    const out: ChartLine[] = [{ id: 'main', points, color: colors.price, kind: 'area', width: 2 }]
    if (predict) {
      out.push({ id: 'best', points: predict.best, color: colors.predict, kind: 'line', style: LineStyle.Dotted, width: 2, title: 'Best' })
      out.push({ id: 'likely', points: predict.likely, color: colors.predict, kind: 'line', style: LineStyle.Dotted, width: 3, title: 'Likely' })
      out.push({ id: 'worst', points: predict.worst, color: colors.predict, kind: 'line', style: LineStyle.Dotted, width: 2, title: 'Worst' })
    }
    return out
  }, [points, predict, colors])

  const band = useMemo(() => (predict ? { points: predict.band, color: withAlpha(colors.predict, 0.13), attachTo: 'likely' } : null), [predict, colors])
  const highlight = useMemo(() => (sel ? { from: sel.from as Time, to: sel.to as Time } : null), [sel])
  const formatValue = useMemo(() => (v: number) => priceText(v, unit), [unit])

  const visible = useMemo(() => (series?.dates.length ? { from: series.dates[startIdx] as Time, to: (predict?.end ?? lastDate) as Time } : null), [series, startIdx, predict, lastDate])

  // The period highlighted by the history puller.
  const selIdx = useMemo(() => {
    if (!sel || !series) return null
    const a = Math.max(0, indexOnOrBefore(series.dates, sel.from))
    const b = indexOnOrBefore(series.dates, sel.to)
    return b > a ? { a, b } : null
  }, [sel, series])
  const stats = useMemo(() => (selIdx && series ? periodStats(series.dates, series.price, series.total, selIdx.a, selIdx.b, total ? 'total' : 'price') : null), [selIdx, series, total])

  const onSelect = (from: Time, to: Time) => {
    if (!series) return
    let a = timeISO(from)
    let b = timeISO(to)
    if (!a || !b) return
    if (a > b) [a, b] = [b, a]
    const first = series.dates[0]
    if (b > lastDate) b = lastDate
    if (a < first) a = first
    if (a >= b) return
    setSel({ from: a, to: b })
  }

  if (!item) {
    return (
      <div className="mk-page">
        <button type="button" className="btn btn-quiet mk-back" onClick={onBack}>
          ‹ Markets
        </button>
        <p className="loading">{infoLoading ? 'Loading…' : `Couldn’t find ${id}.`}</p>
      </div>
    )
  }

  const startValue = shown?.[startIdx] ?? NaN
  const isDay = range === '1D'
  let headValue = lastValue
  let headChange = change(lastValue, startValue)
  let headWhen = rangeWords[range]
  if (isDay && intra?.prev) headChange = change(intra.points[intra.points.length - 1].value, intra.prev)
  if (isDay && !intra && quote) {
    const fx = convert && rate ? rate(quote.asOf.slice(0, 10)) : null
    headValue = fx ? quote.price / fx : quote.price
    headChange = change(headValue, fx ? quote.prev / fx : quote.prev)
    headWhen = `on ${dayText(quote.asOf)}`
  }
  if (hover) {
    headValue = hover.value
    const iso = timeISO(hover.time)
    const base = isDay ? intra?.prev ?? startValue : startValue
    headChange = change(hover.value, base)
    headWhen = iso ? (lastDate && iso > lastDate ? `estimate for ${dayText(iso)}` : dayText(iso)) : 'at that time'
  }

  const horizonLabel = (h: Horizon) => `${h} year${h === 1 ? '' : 's'}`
  const trFrom = daily?.file.trFrom
  const missingDistributions = !!etf && !!trFrom && !!stats && stats.from < trFrom
  const currencyNote = convert ? ', in Australian dollars' : usd ? ', in US dollars' : ''
  const chartHeight = wide() ? 420 : 300

  return (
    <div className="mk-page">
      <button type="button" className="btn btn-quiet mk-back" onClick={onBack}>
        ‹ Markets
      </button>

      <header className="mk-head">
        <div className="mk-head-title">
          <h1>{item.id}</h1>
          <MarketBadge exchange={item.kind === 'fx' ? 'fx' : exchangeOf(item.market)} now={now} />
        </div>
        <p className="mk-head-name">{item.name}</p>
        <div className="mk-head-price" aria-live="polite">
          <strong>{Number.isFinite(headValue) ? priceText(headValue, unit) : '–'}</strong>
          {Number.isFinite(headChange.pct) && <ChangePill abs={headChange.abs} pct={headChange.pct} unit={unit} />}
          <span className="mk-head-when">{headWhen}</span>
        </div>
        <p className="mk-fresh">
          {freshness.label}
          {convert ? ' · shown in A$' : ''}
        </p>
      </header>

      <section className="block mk-chart-block">
        <div className="mk-ranges" role="radiogroup" aria-label="Chart range">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={range === r}
              className={range === r ? 'is-on' : undefined}
              onClick={() => {
                setPrefs({ range: r })
                setHover(null)
              }}
            >
              {r}
            </button>
          ))}
        </div>

        {loading && !daily ? (
          <div className="mk-chart-empty" style={{ height: chartHeight }}>
            Loading the chart…
          </div>
        ) : !daily ? (
          <div className="mk-chart-empty" style={{ height: chartHeight }}>
            No prices for {item.id} on this device yet. Connect to the internet and pull down to refresh.
          </div>
        ) : isDay ? (
          intra ? (
            <MarketChart
              key={`intraday-${id}`}
              lines={[{ id: 'main', points: intra.points, color: colors.price, kind: 'area' }]}
              visible={null}
              timeKind="intraday"
              formatValue={formatValue}
              colors={colors}
              height={chartHeight}
              label={`${item.id} price today, every 5 minutes`}
              onCrosshair={(t, v) => setHover(t !== null && v.main !== undefined ? { time: t, value: v.main } : null)}
            />
          ) : (
            <div className="mk-chart-empty" style={{ height: chartHeight }}>
              <strong>No 1-day prices yet</strong>
              <span>
                Prices every 5 minutes are added to the website while the {item.market === 'us' ? 'US' : 'Australian'} market is open. Running on this computer, or before the first update of the day, there aren’t any yet. The latest close is shown above.
              </span>
            </div>
          )
        ) : (
          <MarketChart
            key={`day-${id}`}
            lines={lines}
            band={band}
            whitespace={predict?.whitespace}
            visible={visible}
            timeKind="day"
            formatValue={formatValue}
            highlight={highlight}
            onSelect={(a, b) => onSelect(a, b)}
            selectMode={picking}
            colors={colors}
            height={chartHeight}
            label={`${item.id} ${total ? 'total return' : 'price'} chart, ${rangeWords[range]}`}
            onCrosshair={(t, v) => setHover(t !== null ? (v.main ?? v.likely) !== undefined ? { time: t, value: (v.main ?? v.likely) as number } : null : null)}
          />
        )}
        <p className="mk-chart-hint">{coarsePointer() ? 'Touch and hold the chart to see the date and price.' : 'Hover over the chart to see the date and price. Drag across it to pull a rate from history.'}</p>

        <div className="mk-toggles">
          {etf && <Toggle label="Total return (with distributions)" checked={prefs.totalReturn} onChange={(on) => setPrefs({ totalReturn: on })} info="totalReturn" />}
          {usd && <Toggle label="Show in Australian dollars" checked={prefs.inAud} onChange={(on) => setPrefs({ inAud: on })} info="inAud" />}
          {etf && monthly?.etfs[id] && <Toggle label="Prediction lines" checked={prefs.predictions} onChange={(on) => setPrefs({ predictions: on })} info="prediction" disabled={isDay} />}
        </div>
        {total && trFrom && series && series.dates[startIdx] < trFrom && !isDay && (
          <p className="block-hint">Before {dayText(trFrom)} there are no distribution records, so total return there is the price only.</p>
        )}
        {convert && series && daily && series.dates[0] > daily.rows.dates[0] && <p className="block-hint">Shown in A$ from {dayText(series.dates[0])}, when exchange rates start.</p>}

        {etf && monthly?.etfs[id] && prefs.predictions && !isDay && (
          <div className="mk-predict">
            <div className="mk-predict-head">
              <span>Predict ahead</span>
              <Segmented<string> label="How far ahead" value={String(prefs.horizon)} onChange={(v) => setPrefs({ horizon: Number(v) as Horizon })} options={HORIZONS.map((h) => ({ value: String(h), label: horizonLabel(h) }))} />
            </div>
            {predict ? (
              <>
                <ul className="mk-predict-list">
                  {(
                    [
                      ['Best', predict.p.best, '1 in 10 replays did better'],
                      ['Likely', predict.p.likely, 'the middle result'],
                      ['Worst', predict.p.worst, '9 in 10 replays did better'],
                    ] as const
                  ).map(([name, arr, note]) => (
                    <li key={name}>
                      <span className={`mk-key mk-key-${name.toLowerCase()}`} aria-hidden="true" />
                      <span className="mk-predict-name">{name}</span>
                      <strong>{priceText(lastValue * arr[predict.p.months], unit)}</strong>
                      <span>{rateText(yearlyFromMultiplier(arr[predict.p.months], predict.p.months))} a year</span>
                      <span className="mk-predict-note">{note}</span>
                    </li>
                  ))}
                </ul>
                <p className="block-hint">
                  An estimate based on history, not a promise: {predict.p.runs.toLocaleString('en-AU')} replays of real months from {monthText(predict.p.historyFrom)} to {monthText(predict.p.historyTo)}
                  {total ? ', with distributions reinvested' : ', price only (the usual distributions taken out)'}
                  {usd ? (convert ? ', in A$' : ', in US$') : ''}, after {item.id}’s fee. {predict.p.realFrom && predict.p.realFrom > predict.p.historyFrom ? `Before ${monthText(predict.p.realFrom)} it uses the index it follows. ` : ''}
                  The future can be different. <Tip term="proxy" />
                </p>
              </>
            ) : (
              <p className="block-hint">Working out the prediction lines…</p>
            )}
          </div>
        )}
      </section>

      {!isDay && series && (
        <section className="block mk-puller">
          <div className="block-head">
            <h2>Pull a rate from history</h2>
            <p className="block-hint">{coarsePointer() ? 'Tap “Pick a period”, then slide your finger across the chart.' : 'Drag across the chart above to highlight a period, or type the dates.'}</p>
          </div>
          <div className="mk-puller-tools">
            <button type="button" className={`btn ${picking ? 'btn-primary' : 'btn-quiet'}`} aria-pressed={picking} onClick={() => setPicking((p) => !p)}>
              {picking ? 'Done picking' : 'Pick a period'}
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => setSel({ from: series.dates[startIdx], to: lastDate })}>
              Use the range shown
            </button>
            <label className="mk-date">
              <span>From</span>
              <input type="date" min={series.dates[0]} max={lastDate} value={sel?.from ?? ''} onChange={(e) => e.target.value && setSel((s) => ({ from: e.target.value, to: s?.to && s.to > e.target.value ? s.to : lastDate }))} />
            </label>
            <label className="mk-date">
              <span>To</span>
              <input type="date" min={series.dates[0]} max={lastDate} value={sel?.to ?? ''} onChange={(e) => e.target.value && setSel((s) => ({ from: s?.from && s.from < e.target.value ? s.from : series.dates[0], to: e.target.value }))} />
            </label>
          </div>
          {stats ? (
            <>
              <p className="mk-period">
                {dayText(stats.from)} to {dayText(stats.to)} ({stats.years >= 1 ? `${stats.years.toFixed(1)} years` : `${stats.days} days`}
                {currencyNote})
              </p>
              <dl className="mk-stats">
                <div>
                  <dt>
                    Average a year{etf ? ', total return' : ''} <Tip term="averageYearly" />
                  </dt>
                  <dd>{etf ? rateText(stats.totalYearly) : rateText(stats.priceYearly)}</dd>
                </div>
                {etf && (
                  <div>
                    <dt>Average a year, price only</dt>
                    <dd>{rateText(stats.priceYearly)}</dd>
                  </div>
                )}
                <div>
                  <dt>
                    Volatility <Tip term="volatility" />
                  </dt>
                  <dd>{rateText(stats.volatility)} a year</dd>
                </div>
                <div>
                  <dt>
                    Biggest drop <Tip term="biggestDrop" />
                  </dt>
                  <dd>
                    {stats.biggestDrop > 0 ? `−${rateText(stats.biggestDrop)}` : 'None'}
                    {stats.dropFrom && stats.dropTo && (
                      <span>
                        {monthText(stats.dropFrom)} to {monthText(stats.dropTo)}
                      </span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>
                    Best year <Tip term="bestWorstYear" />
                  </dt>
                  <dd>{stats.best ? `${stats.best.year}: ${rateText(stats.best.ret)}` : 'Needs a full calendar year'}</dd>
                </div>
                <div>
                  <dt>Worst year</dt>
                  <dd>{stats.worst ? `${stats.worst.year}: ${rateText(stats.worst.ret)}` : 'Needs a full calendar year'}</dd>
                </div>
              </dl>
              <p className="block-hint">
                Volatility, biggest drop and best/worst year use {total ? 'total return' : 'the price only'}.{stats.years < 1 ? ' Under a year: the yearly figure is stretched from a short period, so treat it with care.' : ''}
              </p>
              {missingDistributions && trFrom && <p className="warnings mk-note">Before {dayText(trFrom)} there are no distribution records, so total return for that part is really the price only (too low).</p>}
              <div className="mk-sheet-actions">
                {etf ? (
                  <button type="button" className="btn btn-primary" onClick={() => setSheet(true)}>
                    Use in Planner
                  </button>
                ) : (
                  <p className="block-hint">Indexes here leave out dividends. To send a rate to the Planner, pick an ETF.</p>
                )}
                <button type="button" className="btn btn-quiet" onClick={() => setSel(null)}>
                  Clear
                </button>
              </div>
            </>
          ) : (
            <p className="block-hint">Nothing highlighted yet.</p>
          )}
        </section>
      )}

      {etf && <KeyFacts etf={etf} />}

      {sheet && stats && etf && (
        <UseInPlanner
          plan={plan}
          setPlan={setPlan}
          etfId={etf.id}
          etfName={etf.id}
          merPct={etf.mer?.value ?? null}
          usListed={etf.currency === 'USD'}
          stats={stats}
          currencyNote={currencyNote}
          missingDistributions={missingDistributions}
          onUseHistoryWindow={onUseHistoryWindow}
          inAud={convert}
          onClose={() => setSheet(false)}
        />
      )}
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

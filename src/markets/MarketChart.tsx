// The big interactive chart on the ETF page and in Compare, drawn with TradingView Lightweight
// Charts (free, Apache 2.0 licence; its TradingView logo link on the chart is the attribution the
// licence asks for, and the notice is on the Markets page).
//
// Scrolling and zooming are switched off: the range buttons choose what's shown, so a finger on
// the chart never fights the page. Touch and hold (or hover with a mouse) to see the date and
// price. Drag with a mouse, or in "pick a period" mode with a finger, to highlight a period.

import { useEffect, useRef, type CSSProperties, type PointerEvent as RPointerEvent } from 'react'
import {
  AreaSeries,
  ColorType,
  CrosshairMode,
  LineSeries,
  LineStyle,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type SeriesType,
  type Time,
  TickMarkType,
} from 'lightweight-charts'
import { withAlpha, type ChartColors } from './colors'
import { timeISO } from './chartTime'
import { BandPrimitive, HighlightPrimitive, type BandPoint } from './primitives'

export interface ChartLine {
  id: string
  points: { time: Time; value: number }[]
  color: string
  kind: 'area' | 'line'
  style?: LineStyle
  width?: 1 | 2 | 3 | 4
  /** Label next to the last value on the price axis. */
  title?: string
  lastValueVisible?: boolean
}

export interface MarketChartProps {
  lines: ChartLine[]
  /** A shaded band drawn behind the lines (prediction range), measured on the line `attachTo`. */
  band?: { points: BandPoint[]; color: string; attachTo: string } | null
  /** Blank dates that keep the time axis to scale (e.g. weekdays in the future, for predictions). */
  whitespace?: Time[]
  visible: { from: Time; to: Time } | null
  timeKind: 'day' | 'intraday'
  formatValue: (v: number) => string
  formatAxis?: (v: number) => string
  highlight?: { from: Time; to: Time } | null
  /** Called while a period is dragged out and when the drag ends. */
  onSelect?: (from: Time, to: Time, done: boolean) => void
  /** Touch: pick-a-period mode (the finger highlights instead of scrolling the page). */
  selectMode?: boolean
  onCrosshair?: (time: Time | null, values: Record<string, number>) => void
  colors: ChartColors
  height: number
  label: string
}

const monthShort = new Intl.DateTimeFormat('en-AU', { month: 'short', timeZone: 'UTC' })
const dayMonth = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const dayFull = new Intl.DateTimeFormat('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const clock = new Intl.DateTimeFormat('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })
const clockDay = new Intl.DateTimeFormat('en-AU', { weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true })

const clean = (s: string) => s.replace(/\s?(am|pm)/i, (m) => m.trim().toLowerCase()).replace(',', '')

function tick(time: Time, type: TickMarkType): string {
  if (typeof time === 'number') return clean(clock.format(new Date(time * 1000)))
  const d = new Date(`${timeISO(time)}T12:00:00Z`)
  if (type === TickMarkType.Year) return String(d.getUTCFullYear())
  if (type === TickMarkType.Month) return monthShort.format(d)
  return dayMonth.format(d)
}

function crosshairTime(time: Time): string {
  if (typeof time === 'number') return clean(clockDay.format(new Date(time * 1000)))
  return dayFull.format(new Date(`${timeISO(time)}T12:00:00Z`))
}

const ease = (t: number) => 1 - Math.pow(1 - t, 3)

export function MarketChart(props: MarketChartProps) {
  const { lines, band, whitespace, visible, timeKind, highlight, selectMode, colors, height, label } = props
  const box = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef(new Map<string, { api: ISeriesApi<SeriesType>; kind: ChartLine['kind']; points: ChartLine['points'] }>())
  const blankRef = useRef<ISeriesApi<'Line'> | null>(null)
  const bandRef = useRef(new BandPrimitive())
  const bandHost = useRef<ISeriesApi<SeriesType> | null>(null)
  const hlRef = useRef(new HighlightPrimitive())
  const hlHost = useRef<ISeriesApi<SeriesType> | null>(null)
  const anim = useRef<number | null>(null)
  // the first range is set straight away; later changes glide
  const animated = useRef(false)
  // latest callbacks, so the chart's own listeners never go stale
  const cb = useRef(props)
  const firstTimeKind = useRef(timeKind)
  useEffect(() => {
    cb.current = props
  })

  // Make the chart once.
  useEffect(() => {
    const el = box.current
    if (!el) return
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, attributionLogo: true, fontSize: 12, fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif' },
      handleScroll: false,
      handleScale: false,
      // the bottom margin keeps the line clear of the TradingView logo in the corner
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.14, bottom: 0.16 } },
      timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true, rightOffset: 0, shiftVisibleRangeOnNewBar: false, lockVisibleTimeRangeOnResize: true, timeVisible: firstTimeKind.current === 'intraday', secondsVisible: false, tickMarkFormatter: tick },
      crosshair: { mode: CrosshairMode.Magnet },
      grid: { vertLines: { visible: false } },
      localization: { locale: 'en-AU', timeFormatter: crosshairTime, priceFormatter: (v: number) => cb.current.formatValue(v) },
      kineticScroll: { touch: false, mouse: false },
    })
    chartRef.current = chart
    blankRef.current = chart.addSeries(LineSeries, { visible: false, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false })

    const onMove = (p: MouseEventParams<Time>) => {
      const fn = cb.current.onCrosshair
      if (!fn) return
      if (!p.time || !p.point || p.point.x < 0) return fn(null, {})
      const values: Record<string, number> = {}
      seriesRef.current.forEach((s, id) => {
        const d = p.seriesData.get(s.api) as { value?: number } | undefined
        if (d && typeof d.value === 'number') values[id] = d.value
      })
      fn(p.time, values)
    }
    chart.subscribeCrosshairMove(onMove)
    const series = seriesRef.current
    return () => {
      chart.unsubscribeCrosshairMove(onMove)
      if (anim.current) cancelAnimationFrame(anim.current)
      chart.remove()
      chartRef.current = null
      series.clear()
      bandHost.current = null
      hlHost.current = null
    }
    // the time kind never changes for one chart (the parent remounts it)
  }, [])

  // Colours (light/dark).
  useEffect(() => {
    chartRef.current?.applyOptions({
      layout: { textColor: colors.ink3 },
      grid: { horzLines: { color: withAlpha(colors.line, 0.9) } },
      crosshair: {
        vertLine: { color: colors.ink3, labelBackgroundColor: colors.ink2, style: LineStyle.Dashed },
        horzLine: { color: colors.ink3, labelBackgroundColor: colors.ink2, style: LineStyle.Dashed },
      },
    })
  }, [colors])

  useEffect(() => {
    chartRef.current?.applyOptions({ localization: { priceFormatter: (v: number) => cb.current.formatValue(v) } })
    chartRef.current?.priceScale('right').applyOptions({})
  }, [props.formatValue])

  // Lines: add, update or remove series to match.
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const map = seriesRef.current
    const wanted = new Set(lines.map((l) => l.id))
    for (const [id, s] of map) {
      if (!wanted.has(id)) {
        if (bandHost.current === s.api) bandHost.current = null
        if (hlHost.current === s.api) hlHost.current = null
        chart.removeSeries(s.api)
        map.delete(id)
      }
    }
    for (const l of lines) {
      let s = map.get(l.id)
      if (s && s.kind !== l.kind) {
        if (bandHost.current === s.api) bandHost.current = null
        if (hlHost.current === s.api) hlHost.current = null
        chart.removeSeries(s.api)
        map.delete(l.id)
        s = undefined
      }
      const common = {
        priceLineVisible: false,
        lastValueVisible: l.lastValueVisible ?? true,
        title: l.title ?? '',
        lineWidth: l.width ?? 2,
        lineStyle: l.style ?? LineStyle.Solid,
        crosshairMarkerRadius: 4,
      }
      if (!s) {
        const api =
          l.kind === 'area'
            ? chart.addSeries(AreaSeries, { ...common, lineColor: l.color, topColor: withAlpha(l.color, 0.22), bottomColor: withAlpha(l.color, 0.0) })
            : chart.addSeries(LineSeries, { ...common, color: l.color })
        s = { api, kind: l.kind, points: [] }
        map.set(l.id, s)
      } else if (l.kind === 'area') {
        s.api.applyOptions({ ...common, lineColor: l.color, topColor: withAlpha(l.color, 0.22), bottomColor: withAlpha(l.color, 0.0) })
      } else {
        s.api.applyOptions({ ...common, color: l.color })
      }
      if (s.points !== l.points) {
        s.api.setData(l.points)
        s.points = l.points
      }
    }
  }, [lines])

  useEffect(() => {
    blankRef.current?.setData((whitespace ?? []).map((time) => ({ time })))
  }, [whitespace])

  // Prediction band.
  useEffect(() => {
    const host = band ? seriesRef.current.get(band.attachTo)?.api ?? null : null
    if (bandHost.current && bandHost.current !== host) {
      bandHost.current.detachPrimitive(bandRef.current)
      bandHost.current = null
    }
    if (host && bandHost.current !== host) {
      host.attachPrimitive(bandRef.current)
      bandHost.current = host
    }
    bandRef.current.set(band?.points ?? [], band?.color ?? 'transparent')
  }, [band, lines])

  // Highlighted period.
  useEffect(() => {
    const host = lines.length ? seriesRef.current.get(lines[0].id)?.api ?? null : null
    if (hlHost.current && hlHost.current !== host) {
      hlHost.current.detachPrimitive(hlRef.current)
      hlHost.current = null
    }
    if (host && hlHost.current !== host) {
      host.attachPrimitive(hlRef.current)
      hlHost.current = host
    }
    hlRef.current.set(highlight ?? null, withAlpha(colors.accent, 0.13), withAlpha(colors.accent, 0.7))
  }, [highlight, lines, colors])

  // What's shown: glide smoothly from the old range to the new one. Waits a frame so the chart has
  // taken in any new data first.
  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !visible) return
    const ts = chart.timeScale()
    const frame = requestAnimationFrame(() => {
      const a = ts.timeToIndex(visible.from, true)
      const b = ts.timeToIndex(visible.to, true)
      if (a === null || b === null) {
        ts.fitContent()
        return
      }
      const target = { from: Number(a), to: Number(b) }
      const start = ts.getVisibleLogicalRange()
      if (anim.current) cancelAnimationFrame(anim.current)
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (!start || reduce || !Number.isFinite(start.from) || !animated.current) {
        animated.current = true
        ts.setVisibleLogicalRange(target)
        return
      }
      const t0 = performance.now()
      const step = (now: number) => {
        const k = ease(Math.min(1, (now - t0) / 320))
        ts.setVisibleLogicalRange({ from: start.from + (target.from - start.from) * k, to: start.to + (target.to - start.to) * k })
        anim.current = k < 1 ? requestAnimationFrame(step) : null
      }
      anim.current = requestAnimationFrame(step)
    })
    return () => cancelAnimationFrame(frame)
  }, [visible, lines, whitespace])

  // Dragging out a period (mouse always; touch only in pick-a-period mode).
  const drag = useRef<{ x0: number; active: boolean; from: Time | null } | null>(null)
  const timeAt = (clientX: number): Time | null => {
    const chart = chartRef.current
    const el = box.current
    if (!chart || !el) return null
    const ts = chart.timeScale()
    const x = Math.max(0, Math.min(ts.width() - 1, clientX - el.getBoundingClientRect().left))
    return ts.coordinateToTime(x)
  }
  const onDown = (e: RPointerEvent) => {
    if (!cb.current.onSelect) return
    if (e.pointerType !== 'mouse' && !selectMode) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    drag.current = { x0: e.clientX, active: false, from: timeAt(e.clientX) }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: RPointerEvent) => {
    const d = drag.current
    if (!d) return
    if (!d.active && Math.abs(e.clientX - d.x0) < 6) return
    d.active = true
    const to = timeAt(e.clientX)
    if (d.from !== null && to !== null) cb.current.onSelect?.(d.from, to, false)
  }
  const onUp = (e: RPointerEvent) => {
    const d = drag.current
    drag.current = null
    if (!d?.active) return
    const to = timeAt(e.clientX)
    if (d.from !== null && to !== null) cb.current.onSelect?.(d.from, to, true)
  }

  const style = { height } as CSSProperties
  return (
    <div className={`mk-chart${selectMode ? ' is-selecting' : ''}`} style={style} role="img" aria-label={label}>
      <div ref={box} className="mk-chart-canvas" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => (drag.current = null)} />
      {selectMode && <div className="mk-select-layer" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => (drag.current = null)} aria-hidden="true" />}
    </div>
  )
}

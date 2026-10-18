// Small shared pieces of the Markets tab: change pills, market badges, freshness label, sparkline.

import { direction, changeText, pctText, type Unit } from './format'
import { fxOpen, marketStatus, statusText, type Exchange } from './hours'

/** ▲ +$0.50 (+0.47%), with the colour as a second cue (never the only one). */
export function ChangePill({ abs, pct, unit, showAbs = true, size = 'md' }: { abs: number; pct: number; unit: Unit; showAbs?: boolean; size?: 'sm' | 'md' }) {
  const dir = direction(pct)
  const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '–'
  return (
    <span className={`mk-change is-${dir} is-${size}`}>
      <span aria-hidden="true">{arrow}</span>
      {showAbs && <span>{changeText(abs, unit)}</span>}
      <span>{showAbs ? `(${pctText(pct)})` : pctText(pct)}</span>
    </span>
  )
}

export function MarketBadge({ exchange, now, long = false }: { exchange: Exchange | 'fx'; now: Date; long?: boolean }) {
  if (exchange === 'fx') {
    const open = fxOpen(now)
    return <span className={`mk-badge ${open ? 'is-open' : 'is-closed'}`}>{open ? 'Trading' : 'Closed for the weekend'}</span>
  }
  const s = marketStatus(exchange, now)
  const name = exchange === 'asx' ? 'ASX' : 'NYSE'
  return (
    <span className={`mk-badge ${s.open ? 'is-open' : 'is-closed'}`}>
      <span className="mk-dot" aria-hidden="true" />
      {long ? `${name} ${statusText(s, now)}` : `${name} ${s.open ? 'open' : 'closed'}`}
    </span>
  )
}

/** A tiny line of the last month's prices. */
export function Sparkline({ values, dir, width = 84, height = 30 }: { values: number[]; dir: 'up' | 'down' | 'flat'; width?: number; height?: number }) {
  if (values.length < 2) return <svg className="mk-spark" width={width} height={height} aria-hidden="true" />
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * (width - 2) + 1).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`)
  const base = height - 2 - ((values[0] - min) / span) * (height - 4)
  return (
    <svg className={`mk-spark is-${dir}`} width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <line x1="1" x2={width - 1} y1={base} y2={base} className="mk-spark-base" vectorEffect="non-scaling-stroke" />
      <polyline points={pts.join(' ')} fill="none" vectorEffect="non-scaling-stroke" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

// Text for prices, changes and percentages on the Markets tab.

export type Unit = 'AUD' | 'USD' | 'points' | 'fx'

const fmt = (min: number, max: number) => new Intl.NumberFormat('en-AU', { minimumFractionDigits: min, maximumFractionDigits: max })
const f2 = fmt(2, 2)
const f1 = fmt(1, 1)
const f4 = fmt(4, 4)
const f0 = fmt(0, 0)

/** $106.70, US$612.30, 8,912.4 (index points), US$0.6512 (AUD/USD). */
export function priceText(v: number, unit: Unit): string {
  if (!Number.isFinite(v)) return '–'
  const sign = v < 0 ? '−' : ''
  const a = Math.abs(v)
  switch (unit) {
    case 'AUD':
      return `${sign}$${f2.format(a)}`
    case 'USD':
      return `${sign}US$${f2.format(a)}`
    case 'fx':
      return `${sign}US$${f4.format(a)}`
    case 'points':
      return `${sign}${f1.format(a)}`
  }
}

/** Short axis labels: $106, $1.2K… (the chart's price scale). */
export function axisText(v: number, unit: Unit): string {
  if (unit === 'fx') return f4.format(v)
  const a = Math.abs(v)
  const digits = a >= 1000 ? f0 : a >= 100 ? f1 : f2
  const prefix = unit === 'AUD' ? '$' : unit === 'USD' ? 'US$' : ''
  return `${v < 0 ? '−' : ''}${prefix}${digits.format(a)}`
}

/** +1.23% / −0.40% (from a fraction). */
export function pctText(frac: number, digits = 2): string {
  if (!Number.isFinite(frac)) return '–'
  const p = frac * 100
  const rounded = Number(p.toFixed(digits))
  const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : ''
  return `${sign}${Math.abs(rounded).toFixed(digits)}%`
}

/** 7.1% (no + sign, for rates like "7.1% a year"). */
export function rateText(frac: number, digits = 1): string {
  if (!Number.isFinite(frac)) return '–'
  const p = Number((frac * 100).toFixed(digits))
  return `${p < 0 ? '−' : ''}${Math.abs(p).toFixed(digits)}%`
}

/** +$0.50 / −US$1.20 / +12.3 points. */
export function changeText(v: number, unit: Unit): string {
  if (!Number.isFinite(v)) return '–'
  const rounded = Number(v.toFixed(unit === 'fx' ? 4 : unit === 'points' ? 1 : 2))
  const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : ''
  return `${sign}${priceText(Math.abs(v), unit)}`
}

export function direction(frac: number): 'up' | 'down' | 'flat' {
  if (!Number.isFinite(frac) || Math.abs(frac) < 0.00005) return 'flat'
  return frac > 0 ? 'up' : 'down'
}

const dateFmt = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const monthFmt = new Intl.DateTimeFormat('en-AU', { month: 'short', year: 'numeric', timeZone: 'UTC' })

/** 16 Oct 2026 (from "YYYY-MM-DD"). */
export function dayText(iso: string): string {
  return dateFmt.format(new Date(`${iso.slice(0, 10)}T12:00:00Z`))
}

/** Oct 2026 (from "YYYY-MM" or "YYYY-MM-DD"). */
export function monthText(ym: string): string {
  return monthFmt.format(new Date(`${ym.slice(0, 7)}-15T12:00:00Z`))
}

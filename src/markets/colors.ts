// The chart library draws on a canvas, so it needs real colours rather than CSS variables.
// This reads the app's colour tokens and reads them again when light/dark mode changes.

import { useEffect, useState } from 'react'

export interface ChartColors {
  surface: string
  ink: string
  ink2: string
  ink3: string
  line: string
  lineStrong: string
  accent: string
  price: string
  predict: string
  compare: string[]
}

function read(): ChartColors {
  const s = getComputedStyle(document.documentElement)
  const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback
  return {
    surface: v('--surface', '#ffffff'),
    ink: v('--ink', '#142019'),
    ink2: v('--ink-2', '#44524b'),
    ink3: v('--ink-3', '#6b7871'),
    line: v('--line', '#dbe3de'),
    lineStrong: v('--line-strong', '#c5d0c9'),
    accent: v('--accent', '#1d5c4a'),
    price: v('--mk-price', '#2a68a6'),
    predict: v('--mk-predict', '#9a5b00'),
    compare: [1, 2, 3, 4, 5].map((i) => v(`--mk-c${i}`, '#2a68a6')),
  }
}

export function useChartColors(): ChartColors {
  const [colors, setColors] = useState(read)
  useEffect(() => {
    const update = () => setColors(read())
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', update)
    const mo = new MutationObserver(update)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => {
      mq.removeEventListener('change', update)
      mo.disconnect()
    }
  }, [])
  return colors
}

/** A colour with transparency, from "#rrggbb". */
export function withAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return hex
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

// Small drawing add-ons for the chart library: a shaded band between two lines (the prediction
// range) and a highlighted period (the history puller).

import type { IChartApi, IPrimitivePaneRenderer, IPrimitivePaneView, ISeriesApi, ISeriesPrimitive, SeriesAttachedParameter, SeriesType, Time } from 'lightweight-charts'

type Ctx = { chart: IChartApi; series: ISeriesApi<SeriesType>; requestUpdate: () => void }

abstract class Base implements ISeriesPrimitive<Time> {
  protected ctx: Ctx | null = null
  private readonly views: IPrimitivePaneView[]

  constructor(zOrder: 'bottom' | 'normal' | 'top') {
    const renderer: IPrimitivePaneRenderer = {
      draw: () => {},
      drawBackground: (target) => {
        target.useMediaCoordinateSpace(({ context, mediaSize }) => this.paint(context, mediaSize.width, mediaSize.height))
      },
    }
    this.views = [{ zOrder: () => zOrder, renderer: () => renderer }]
  }

  attached(p: SeriesAttachedParameter<Time>): void {
    this.ctx = { chart: p.chart as IChartApi, series: p.series as ISeriesApi<SeriesType>, requestUpdate: p.requestUpdate }
  }

  detached(): void {
    this.ctx = null
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this.views
  }

  protected update(): void {
    this.ctx?.requestUpdate()
  }

  protected abstract paint(c: CanvasRenderingContext2D, width: number, height: number): void
}

export interface BandPoint {
  time: Time
  upper: number
  lower: number
}

/** Fills the area between an upper and a lower line. */
export class BandPrimitive extends Base {
  private points: BandPoint[] = []
  private color = 'rgba(0,0,0,0.1)'

  constructor() {
    super('bottom')
  }

  set(points: BandPoint[], color: string): void {
    this.points = points
    this.color = color
    this.update()
  }

  protected paint(c: CanvasRenderingContext2D): void {
    if (!this.ctx || this.points.length < 2) return
    const ts = this.ctx.chart.timeScale()
    const s = this.ctx.series
    const top: [number, number][] = []
    const bottom: [number, number][] = []
    for (const p of this.points) {
      const x = ts.timeToCoordinate(p.time)
      const yu = s.priceToCoordinate(p.upper)
      const yl = s.priceToCoordinate(p.lower)
      if (x === null || yu === null || yl === null) continue
      top.push([x, yu])
      bottom.push([x, yl])
    }
    if (top.length < 2) return
    c.beginPath()
    top.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)))
    for (let i = bottom.length - 1; i >= 0; i--) c.lineTo(bottom[i][0], bottom[i][1])
    c.closePath()
    c.fillStyle = this.color
    c.fill()
  }
}

/** Shades a period from one date to another, full height, with an edge line on each side. */
export class HighlightPrimitive extends Base {
  private range: { from: Time; to: Time } | null = null
  private fill = 'rgba(0,0,0,0.08)'
  private edge = 'rgba(0,0,0,0.4)'

  constructor() {
    super('bottom')
  }

  set(range: { from: Time; to: Time } | null, fill: string, edge: string): void {
    this.range = range
    this.fill = fill
    this.edge = edge
    this.update()
  }

  protected paint(c: CanvasRenderingContext2D, width: number, height: number): void {
    if (!this.ctx || !this.range) return
    const ts = this.ctx.chart.timeScale()
    const a = ts.timeToCoordinate(this.range.from)
    const b = ts.timeToCoordinate(this.range.to)
    if (a === null || b === null) return
    const x1 = Math.max(0, Math.min(a, b))
    const x2 = Math.min(width, Math.max(a, b))
    c.fillStyle = this.fill
    c.fillRect(x1, 0, x2 - x1, height)
    c.fillStyle = this.edge
    c.fillRect(x1 - 0.75, 0, 1.5, height)
    c.fillRect(x2 - 0.75, 0, 1.5, height)
  }
}

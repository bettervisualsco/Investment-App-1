// The shapes of the data files the pipeline writes to /data (see docs/DATA_FORMAT.md).
// All times are UTC ISO strings ("2026-10-18T05:12:00Z"); dates are "YYYY-MM-DD"; months "YYYY-MM".

export type MarketKey = 'asx' | 'us'

// ---- data/meta.json ----------------------------------------------------------------------

export interface FileEntry {
  /** Fingerprint of the file's content. A new hash means the file changed. */
  hash: string
  bytes: number
  /** When the content last changed. */
  updatedAt: string
  /** The latest date/time/month the data in the file covers, if it says. */
  asOf?: string
}

export interface SourceHealth {
  label: string
  status: 'ok' | 'error'
  lastAttempt: string
  lastSuccess: string | null
  lastError: string | null
  failures: number
  note?: string
}

export interface TaskState {
  lastAttempt?: string
  lastSuccess?: string
  lastError?: string | null
  /** For daily jobs: the trading day whose close has been saved. */
  forDate?: string
  note?: string
  result?: string
}

export interface Problem {
  at: string
  where: string
  message: string
}

export interface Meta {
  schema: number
  generatedAt: string
  files: Record<string, FileEntry>
  sources: Record<string, SourceHealth>
  tasks: Record<string, TaskState>
  problems: Problem[]
  repo?: { lastCommit: string; daysSinceCommit: number }
}

// ---- data/daily/<ID>.json ----------------------------------------------------------------

export interface DailyFile {
  id: string
  symbol: string
  name: string
  kind: 'etf' | 'index' | 'fx' | 'helper'
  currency: 'AUD' | 'USD'
  asOf: string
  first: string
  last: string
  /** Days since the previous row (first entry is 0). */
  d: number[]
  /** Close (split-adjusted). */
  c: number[]
  /** ETFs only: adjusted close, which includes distributions (total return). */
  a?: number[]
  /** ETFs only: [ex-date, amount per unit]. */
  div?: [string, number][]
  splits?: [string, number][]
  /** ETFs only: adjusted close is a real total return only from this date (see trNote). */
  trFrom?: string
  trNote?: string
  /** Where the rows come from (e.g. the RBA's official rates for AUD/USD). */
  source?: string
  /** Rows from this date on are an approximate stand-in until the official source publishes them. */
  approxFrom?: string
  /** Fixes made to Yahoo's data, in words. */
  repairs?: string[]
}

// ---- data/intraday/<market>.json ------------------------------------------------------------

export interface Quote {
  price: number
  /** Start time of the latest 5-minute bar (UTC). */
  time: string
  prevClose?: number
  change?: number
  changePct?: number
}

export interface IntradayFile {
  market: MarketKey
  exchange: string
  tz: string
  /** The trading day (exchange-local date). */
  session: string
  asOf: string
  generatedAt: string
  note: string
  quotes: Record<string, Quote>
  /** 5-minute closes from t0 (unix seconds), one per `step` seconds; null = no trade in that bar. */
  bars: Record<string, { t0: number; step: number; c: (number | null)[] }>
}

// ---- data/monthly.json ----------------------------------------------------------------------

export interface Segment {
  from: string
  to: string | null
  source: string
}

export interface MonthlySeries {
  label: string
  kind: 'return' | 'inflation' | 'fx'
  currency: 'AUD' | 'USD'
  /** First month in `values`. */
  start: string
  /** Change during each month times `scale` (e.g. 1234 = +1.234%). null = no data. */
  values: (number | null)[]
  segments: Segment[]
  gap?: string
  interpolated?: string[]
}

export interface MonthlyEtf {
  label: string
  currency: 'AUD' | 'USD'
  start: string
  /** Months from here on are the ETF's own total return; earlier months are its proxy minus fees. */
  realFrom: string | null
  /** Yearly fee (0.0007 = 0.07%) taken off the proxy months. */
  fee: number | null
  proxy: { series: string; weight: number; hedged: boolean }[]
  proxyCheck: {
    months: number
    from: string
    to: string
    correlation: number | null
    realYearly: number
    proxyYearly: number
    trackingError: number
  } | null
  values: (number | null)[]
  warning?: string
}

export type AssetSeriesKey =
  | 'au_shares'
  | 'us_shares'
  | 'global_shares'
  | 'us_tech'
  | 'intl_shares'
  | 'gold'
  | 'au_bonds'
  | 'us_bonds'
  | 'cash_au'
  | 'cash_us'
  | 'au_cpi'
  | 'us_cpi'
  | 'audusd'

export interface MonthlyFile {
  schema: number
  asOf: string
  scale: number
  /** Every core series has data from allSeriesFrom to allSeriesTo. */
  allSeriesFrom: string
  allSeriesTo: string
  note: string
  series: Record<AssetSeriesKey, MonthlySeries>
  etfs: Record<string, MonthlyEtf>
}

// ---- data/inflation.json, data/rates.json, data/fx.json --------------------------------------------

export interface LevelSeries {
  /** "YYYY-MM", "YYYY-Qn" or "YYYY-MM-DD" */
  t: string[]
  v: number[]
}

export interface LevelsFile<K extends string> {
  asOf: string
  series: Record<K, LevelSeries>
  info: Record<K, string>
}

export type InflationFile = LevelsFile<'au_cpi_q' | 'au_cpi_m' | 'us_cpi_m'>
export type RatesFile = LevelsFile<'cash_target' | 'cash_monthly' | 'au_bond_5y' | 'au_bond_10y' | 'us_bond_10y'>
export type FxFile = LevelsFile<'audusd_monthly'>

// ---- data/etfs.json ---------------------------------------------------------------------

/** One checked fact, with when it was checked and where it came from. */
export interface Fact<T> {
  value: T
  unit?: string
  note?: string
  checkedOn: string
  source: string
  /** false = couldn't be confirmed from the issuer (estimate or secondary source). */
  verified?: boolean
}

export interface EtfInfo {
  id: string
  symbol: string
  market: MarketKey
  currency: 'AUD' | 'USD'
  name: string
  /** Group the app shows it in: "Australian shares", "Global shares", "Currency-hedged", "Diversified",
   * "Bonds", "Gold" or "US-listed" (from pipeline/tickers.json). Missing in files made before Oct 2026. */
  category?: string
  /** The issuer's full name, with when and where it was checked (and any rename note). */
  nameInfo?: Fact<string>
  /** Date the ETF listed on its exchange; price rows before it are dropped. */
  listed?: Fact<string>
  index?: Fact<string>
  /** Management fee, % a year (0.07 = 0.07%). */
  mer?: Fact<number>
  /** Typical distribution yield, % a year. */
  yield?: Fact<number>
  /** Franking, % of distributions. null = not published. */
  franking?: Fact<number | null>
  exchange?: Fact<string>
  inception?: Fact<string>
  distributions?: Fact<string>
  allocation?: Fact<Record<string, number>>
  duration?: Fact<number>
  proxy: { series: string; weight: number; hedged: boolean }[]
}

export interface IndexInfo {
  id: string
  symbol: string
  name: string
  kind: 'index' | 'fx'
  market: MarketKey
  currency: 'AUD' | 'USD'
}

export interface EtfsFile {
  asOf: string | null
  note: string
  etfs: EtfInfo[]
  indexes: IndexInfo[]
}

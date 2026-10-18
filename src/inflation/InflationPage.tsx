import { targetWord } from './target'
import { useMemo } from 'react'
import { timeAgo, useDataFile, useDataState, type InflationFile, type MonthlyFile } from '../data'
import { pct } from './chartBits'
import { historyLevels, monthlyChain, yearlyInflation, type Country, type MonthlyChain } from './cpi'
import { HistorySection } from './HistorySection'
import { PredictionSection } from './PredictionSection'
import { PurchasingPower } from './PurchasingPower'
import { RealReturns } from './RealReturns'
import { useWindowChoice } from './window'
import { Tip } from './Tip'
import './inflation.css'

function Latest({ file }: { file: InflationFile }) {
  const auM = yearlyInflation(historyLevels(file, 'au_m')).at(-1)
  const auQ = yearlyInflation(historyLevels(file, 'au_q')).at(-1)
  const us = yearlyInflation(historyLevels(file, 'us_m')).at(-1)
  const au = auM ?? auQ
  return (
    <div className="infl-latest">
      {au && (
        <div className="infl-latest-card">
          <div className="infl-tile-label">
            <span className="infl-swatch" style={{ background: 'var(--series-au)' }} aria-hidden="true" />
            Australia
          </div>
          <div className="infl-latest-value">{pct(au.pct / 100)}</div>
          <div className="infl-tile-sub">
            Year to {au.label}
            {auM ? ' (monthly CPI)' : ''}
            {auM && auQ ? `. Quarterly CPI: ${pct(auQ.pct / 100)} to ${auQ.label}.` : ''}
          </div>
          <div className="infl-tile-sub">
            {targetWord(au.pct)} the RBA’s 2–3% target <Tip term="rbaTarget" />
          </div>
        </div>
      )}
      {us && (
        <div className="infl-latest-card">
          <div className="infl-tile-label">
            <span className="infl-swatch" style={{ background: 'var(--series-us)' }} aria-hidden="true" />
            United States
          </div>
          <div className="infl-latest-value">{pct(us.pct / 100)}</div>
          <div className="infl-tile-sub">Year to {us.label}</div>
          <div className="infl-tile-sub">The Federal Reserve aims for 2%</div>
        </div>
      )}
    </div>
  )
}

/** "Latest CPI: Australia Aug 2026 · US Sep 2026 · checked 6 min ago" */
function CpiFreshness({ file }: { file: InflationFile }) {
  const state = useDataState()
  const au = historyLevels(file, 'au_m').points.at(-1) ?? historyLevels(file, 'au_q').points.at(-1)
  const us = historyLevels(file, 'us_m').points.at(-1)
  const parts = [`Latest CPI: Australia ${au?.label ?? '—'}, US ${us?.label ?? '—'}`]
  if (state.checkedAt) parts.push(`checked ${timeAgo(new Date(state.checkedAt).toISOString())}`)
  if (state.status === 'offline') parts.push('offline, using saved data')
  return <p className="infl-fresh">{parts.join(' · ')}</p>
}

/** The Inflation tab: history, predictions, buying power and returns after inflation. */
export function InflationPage() {
  const { data: file, loading } = useDataFile<InflationFile>('inflation.json')
  const { data: monthly } = useDataFile<MonthlyFile>('monthly.json')
  const [choice, setChoice] = useWindowChoice()
  const chains = useMemo<Record<Country, MonthlyChain> | null>(() => (file ? { au: monthlyChain(file, 'au'), us: monthlyChain(file, 'us') } : null), [file])

  return (
    <div className="inflation">
      <header className="infl-head">
        <h1>Inflation</h1>
        <p className="lead">
          How fast prices rise <Tip term="cpi" />, in Australia and the US: the history, an estimate of what might come, and what it means for your money.
        </p>
        {file && <CpiFreshness file={file} />}
      </header>

      {!file || !chains ? (
        <div className="block infl-block">
          <p className="block-hint">{loading ? 'Loading inflation data…' : 'The inflation data hasn’t downloaded yet. Connect to the internet and open the app again.'}</p>
        </div>
      ) : (
        <>
          <Latest file={file} />
          <HistorySection file={file} />
          <PredictionSection chains={chains} choice={choice} setChoice={setChoice} />
          <div className="infl-pair">
            <PurchasingPower file={file} chains={chains} choice={choice} />
            {monthly ? (
              <RealReturns monthly={monthly} chains={chains} />
            ) : (
              <div className="block infl-block">
                <p className="block-hint">Loading ETF returns…</p>
              </div>
            )}
          </div>
          <p className="fine-print infl-sources">
            Sources: Australian Bureau of Statistics (CPI, All groups, weighted average of eight capital cities; CC BY 4.0); US Bureau of Labor Statistics CPI-U via FRED, and Robert Shiller’s data before 1913.
            Predictions are estimates based on past data, and the future can be different. General information only, not financial advice.
          </p>
        </>
      )}
    </div>
  )
}

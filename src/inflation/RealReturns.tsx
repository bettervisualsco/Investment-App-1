import { useMemo, useState } from 'react'
import { Segmented } from '../components/inputs'
import type { MonthlyFile } from '../data/types'
import { pct } from './chartBits'
import type { Country, MonthlyChain } from './cpi'
import { etfRealReturns, type Period } from './etfReal'
import { Tip } from './Tip'

const PERIODS: { value: Period; label: string }[] = [
  { value: '1', label: '1Y' },
  { value: '3', label: '3Y' },
  { value: '5', label: '5Y' },
  { value: '10', label: '10Y' },
  { value: '20', label: '20Y' },
  { value: 'own', label: 'Since start' },
  { value: 'all', label: 'Longest' },
]

/** Each ETF's yearly return before and after inflation, for a chosen period. */
export function RealReturns({ monthly, chains }: { monthly: MonthlyFile; chains: Record<Country, MonthlyChain> }) {
  const [period, setPeriod] = useState<Period>('10')
  const [usInAud, setUsInAud] = useState(true)
  const rows = useMemo(() => etfRealReturns(monthly, chains, period, usInAud), [monthly, chains, period, usInAud])
  const maxAbs = Math.max(0.01, ...rows.map((r) => Math.abs(r.result?.real ?? 0)))
  const anyProxy = rows.some((r) => r.result && r.usesProxy)
  const perRowDates = period === 'own' || period === 'all'
  const common = rows.find((r) => r.result)

  return (
    <section className="block infl-block" aria-labelledby="infl-real-title">
      <div className="block-head">
        <h2 id="infl-real-title">
          ETF returns after inflation <Tip term="realReturn" />
        </h2>
        <p className="block-hint">
          Average a year, compounded. {common && !perRowDates ? `${common.from} to ${common.to}.` : common ? `Each from the date shown to ${common.to}.` : ''}
        </p>
      </div>
      <div className="infl-controls">
        <Segmented<Period> label="Period" value={period} onChange={setPeriod} options={PERIODS} />
      </div>
      <div className="infl-controls">
        <span className="infl-inline">
          <Segmented<'aud' | 'usd'>
            label="US ETFs shown in"
            value={usInAud ? 'aud' : 'usd'}
            onChange={(v) => setUsInAud(v === 'aud')}
            options={[
              { value: 'aud', label: 'US ETFs in A$' },
              { value: 'usd', label: 'in US$' },
            ]}
          />
          <Tip term="currencyView" />
        </span>
      </div>

      <div className="table-scroll">
        <table className="year-table infl-real-table">
          <thead>
            <tr>
              <th scope="col">ETF</th>
              <th scope="col">Return</th>
              <th scope="col">Inflation</th>
              <th scope="col">After inflation</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <th scope="row">
                  <span className="infl-etf" title={r.label}>
                    {r.id}
                    {r.result && r.usesProxy ? '*' : ''}
                  </span>
                  <span className="infl-etf-sub">
                    {r.currency === 'USD' ? (r.view === 'au' ? 'US-listed, in A$' : 'US-listed, US$') : 'ASX'}
                    {perRowDates && r.result ? ` · from ${r.from}` : ''}
                  </span>
                </th>
                {r.result ? (
                  <>
                    <td>{pct(r.result.nominal)}</td>
                    <td>
                      {pct(r.result.inflation)}
                      <span className="infl-etf-sub">{r.view === 'au' ? 'AU' : 'US'}</span>
                    </td>
                    <td>
                      <span className="infl-real-cell">
                        <span className={`infl-bar${r.result.real < 0 ? ' is-neg' : ''}`} style={{ width: `${(Math.abs(r.result.real) / maxAbs) * 100}%` }} aria-hidden="true" />
                        {pct(r.result.real)}
                      </span>
                    </td>
                  </>
                ) : (
                  <td colSpan={3} className="infl-missing">
                    {r.missing ?? '—'}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="fine-print">
        Return = total return (price plus distributions), with the ETF’s fee taken off, before tax and brokerage. After inflation = (1 + return) ÷ (1 + inflation) − 1.
        {anyProxy && (
          <>
            {' '}
            * Includes index history from before the ETF started <Tip term="proxy" />.
          </>
        )}{' '}
        Past returns don’t tell you future returns.
      </p>
    </section>
  )
}

// Settings → Data status: when each data source last updated, any errors, and GitHub's 60-day
// warning from meta.json.

import { asOfText, refreshData, timeAgo, useDataState } from '../data'
import { quietRepoWarning } from './repoStatus'
import { useMinute } from './useMarketData'
import './markets.css'

const taskNames: Record<string, string> = {
  daily_asx: 'ASX closing prices',
  daily_us: 'US closing prices',
  intraday_asx: 'ASX prices during the day',
  intraday_us: 'US prices during the day',
  macro: 'Inflation, cash rate and exchange rates',
  proxies: 'Long-run history (for predictions)',
}

const resultWords: Record<string, string> = {
  written: 'new prices saved',
  unchanged: 'nothing new',
  'no-session': 'market closed',
  failed: 'failed',
}

function when(iso: string | null | undefined, now: Date): string {
  if (!iso) return 'never'
  return `${asOfText(iso, now)} (${timeAgo(iso, now)})`
}

function dateWords(d: string): string {
  return asOfText(d).replace(' close', '')
}

export function DataStatus() {
  const state = useDataState()
  const now = useMinute()
  const meta = state.meta
  const quiet = quietRepoWarning(meta, now)
  const checking = state.status === 'checking'

  return (
    <section className="block">
      <div className="block-head">
        <h2>Data status</h2>
        <button type="button" className="btn btn-quiet" onClick={() => void refreshData()} disabled={checking}>
          {checking ? 'Checking…' : 'Check now'}
        </button>
      </div>
      <p>
        {state.status === 'offline' ? 'Offline: using the data saved on this device. ' : ''}
        Last checked for new data: {state.checkedAt ? when(new Date(state.checkedAt).toISOString(), now) : 'not yet'}.
        {meta ? ` The data was last built ${when(meta.generatedAt, now)}.` : ''}
      </p>

      {quiet && (
        <div className="mk-notice is-stale mk-quiet">
          <strong>Automatic updates may stop soon.</strong> {quiet} GitHub switches off scheduled updates after 60 quiet days. To keep them going:
          <ol>
            <li>Open the app’s repository on github.com.</li>
            <li>Tap the <strong>Actions</strong> tab.</li>
            <li>
              Tap <strong>Update market data</strong> on the left. If it says it’s disabled, tap <strong>Enable workflow</strong>.
            </li>
          </ol>
        </div>
      )}

      {meta ? (
        <>
          <h3 className="sub-head">Sources</h3>
          <ul className="mk-status-list">
            {Object.entries(meta.sources).map(([key, s]) => (
              <li key={key} className={s.status === 'ok' ? 'is-ok' : 'is-error'}>
                <span className="mk-status-icon" aria-hidden="true">
                  {s.status === 'ok' ? '✓' : '!'}
                </span>
                <span>
                  <strong>{s.label}</strong>
                  <span>
                    {s.status === 'ok' ? 'Working' : 'Problem'} · last success {when(s.lastSuccess, now)}
                    {s.failures > 0 ? ` · ${s.failures} failed tr${s.failures === 1 ? 'y' : 'ies'} in a row` : ''}
                  </span>
                  {s.lastError && <span className="mk-status-error">{s.lastError}</span>}
                </span>
              </li>
            ))}
          </ul>

          <h3 className="sub-head">Updates</h3>
          <ul className="mk-status-list">
            {Object.entries(meta.tasks).map(([key, t]) => (
              <li key={key} className={t.lastError ? 'is-error' : 'is-ok'}>
                <span className="mk-status-icon" aria-hidden="true">
                  {t.lastError ? '!' : '✓'}
                </span>
                <span>
                  <strong>{taskNames[key] ?? key}</strong>
                  <span>
                    {t.forDate ? `Saved for ${dateWords(t.forDate)} · ` : ''}
                    last run {when(t.lastAttempt, now)}
                    {t.result ? ` · ${resultWords[t.result] ?? t.result}` : ''}
                  </span>
                  {t.note && <span>{t.note}</span>}
                  {t.lastError && <span className="mk-status-error">{t.lastError}</span>}
                </span>
              </li>
            ))}
          </ul>

          <h3 className="sub-head">Recent problems</h3>
          {meta.problems.length === 0 ? (
            <p className="block-hint">None.</p>
          ) : (
            <ul className="mk-status-list">
              {meta.problems.slice(0, 6).map((p, i) => (
                <li key={i} className="is-error">
                  <span className="mk-status-icon" aria-hidden="true">
                    !
                  </span>
                  <span>
                    <strong>{when(p.at, now)}</strong>
                    <span>
                      {p.where}: {p.message}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="block-hint mk-status-foot">Prices come from Yahoo Finance (delayed about 15–20 minutes); inflation from the ABS and FRED; the cash rate and exchange rates from the RBA. Times are in your own time zone.</p>
        </>
      ) : (
        <p className="block-hint">No data on this device yet.</p>
      )}
    </section>
  )
}

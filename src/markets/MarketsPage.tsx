// The Markets tab: dashboard → ETF page → Compare. Prices update by themselves whenever the app
// opens or comes back to the screen (src/data); pull down (iPhone) or tap Refresh to check now.

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { refreshData, useDataState } from '../data'
import type { Plan } from '../engine/types'
import { ComparePage } from './ComparePage'
import { Dashboard } from './Dashboard'
import { EtfDetail } from './EtfDetail'
import type { HistoryWindowRequest } from './UseInPlanner'
import { useMarketFreshness } from './useMarketData'
import './markets.css'

type View = { v: 'list' } | { v: 'detail'; id: string } | { v: 'compare' }

function viewFromHistory(): View {
  const s = (window.history.state as { mk?: View } | null)?.mk
  return s && (s.v === 'list' || s.v === 'compare' || (s.v === 'detail' && typeof s.id === 'string')) ? s : { v: 'list' }
}

const PULL_TRIGGER = 64

/** Pull down from the top of the page to check for new prices (touch screens). */
function usePullToRefresh(): number {
  const [pull, setPull] = useState(0)
  const pullRef = useRef(0)
  useEffect(() => {
    let startY: number | null = null
    const set = (v: number) => {
      pullRef.current = v
      setPull(v)
    }
    const onStart = (e: TouchEvent) => {
      if (window.scrollY > 0 || e.touches.length !== 1) return
      const t = e.target as Element | null
      if (t?.closest('.mk-chart, .sheet, input, select, textarea, [popover]')) return
      startY = e.touches[0].clientY
    }
    const onMove = (e: TouchEvent) => {
      if (startY === null) return
      const dy = e.touches[0].clientY - startY
      if (dy <= 0 || window.scrollY > 0) return set(0)
      set(Math.min(110, dy * 0.5))
    }
    const onEnd = () => {
      if (startY === null) return
      startY = null
      if (pullRef.current >= PULL_TRIGGER) void refreshData()
      set(0)
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onEnd)
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [])
  return pull
}

/** "You're offline" and "prices haven't updated" notices. */
function DataNotices() {
  const state = useDataState()
  const asx = useMarketFreshness('asx')
  const us = useMarketFreshness('us')
  if (state.status === 'offline') {
    return (
      <p className="mk-notice is-offline" role="status">
        You’re offline. Showing the prices saved on this device{state.checkedAt ? '' : ' (none yet)'}. They’ll update by themselves when you’re back online.
      </p>
    )
  }
  if ((asx.stale || us.stale) && state.meta) {
    return (
      <p className="mk-notice is-stale" role="status">
        Prices haven’t updated for a few days ({asx.stale ? 'ASX' : ''}
        {asx.stale && us.stale ? ' and ' : ''}
        {us.stale ? 'US' : ''}). The app will keep checking. Settings → Data status shows what’s happening.
      </p>
    )
  }
  return null
}

export function MarketsPage({ plan, setPlan, onUseHistoryWindow }: { plan: Plan | null; setPlan: Dispatch<SetStateAction<Plan | null>>; onUseHistoryWindow?: (req: HistoryWindowRequest) => void }) {
  const [view, setView] = useState<View>(viewFromHistory)
  const state = useDataState()
  const pull = usePullToRefresh()
  const asx = useMarketFreshness('asx')
  const us = useMarketFreshness('us')

  useEffect(() => {
    const onPop = () => setView(viewFromHistory())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const go = (v: View) => {
    window.history.pushState({ mk: v }, '', '#/markets')
    setView(v)
    window.scrollTo({ top: 0 })
  }
  const back = () => {
    if ((window.history.state as { mk?: View } | null)?.mk) window.history.back()
    else go({ v: 'list' })
  }

  const checking = state.status === 'checking'
  const pullLabel = checking ? 'Checking for new prices…' : pull >= PULL_TRIGGER ? 'Let go to refresh' : 'Pull down to refresh'

  return (
    <div className="markets">
      <div className={`mk-pull${pull > 0 || checking ? ' is-on' : ''}`} style={{ height: pull > 0 ? pull : checking ? 36 : 0 }} role="status">
        {(pull > 0 || checking) && (
          <>
            <span className={checking ? 'mk-spin' : undefined} aria-hidden="true">
              {checking ? '↻' : '↓'}
            </span>{' '}
            {pullLabel}
          </>
        )}
      </div>
      <DataNotices />

      {view.v === 'list' && (
        <>
          <header className="mk-top">
            <div>
              <h1>Markets</h1>
              <p className="mk-fresh">
                ASX: {asx.label}
                <br />
                US: {us.label}
              </p>
            </div>
            <button type="button" className="btn btn-quiet mk-refresh" onClick={() => void refreshData()} disabled={checking}>
              <span className={checking ? 'mk-spin' : undefined} aria-hidden="true">
                ↻
              </span>
              {checking ? 'Checking…' : 'Refresh'}
            </button>
          </header>
          <Dashboard onOpen={(id) => go({ v: 'detail', id })} onCompare={() => go({ v: 'compare' })} />
          <p className="mk-attrib">
            Prices from Yahoo Finance, delayed about 15–20 minutes. Charts by{' '}
            <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">
              TradingView Lightweight Charts™
            </a>{' '}
            (Copyright (c) 2025 TradingView, Inc.). General information only, not financial advice.
          </p>
        </>
      )}
      {view.v === 'detail' && <EtfDetail key={view.id} id={view.id} onBack={back} plan={plan} setPlan={setPlan} onUseHistoryWindow={onUseHistoryWindow} />}
      {view.v === 'compare' && <ComparePage onBack={back} onOpen={(id) => go({ v: 'detail', id })} />}
    </div>
  )
}

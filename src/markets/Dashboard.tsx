// The Markets dashboard: the main indexes, then the watchlist ETFs with price, change, a mini chart,
// "as of" time and whether their market is open. Search, groups, sort, reorder and star favourites.

import { useMemo, useState } from 'react'
import { Select } from '../components/inputs'
import type { IntradayFile } from '../data'
import { ChangePill, MarketBadge, Sparkline } from './bits'
import { asOfText } from '../data'
import { direction, priceText } from './format'
import { rangeStartIndex } from './maths'
import { moveIdNextTo, orderedIds, usePrefs, type SortKey } from './prefs'
import { latestQuote, type LatestQuote } from './quotes'
import { exchangeOf, unitOf, useDailyMany, useEtfs, useIntraday, useMinute, type Item } from './useMarketData'
import { watchSections } from './watchlist'
import { Tip, Toggle } from './words'

interface Row {
  item: Item
  quote: LatestQuote | null
  spark: number[]
}

function buildRow(item: Item, daily: ReturnType<typeof useDailyMany>, intraday: Record<'asx' | 'us', IntradayFile | undefined>): Row {
  const d = daily.get(item.id)
  const quote = latestQuote(d?.rows, intraday[item.market], item.id)
  let spark: number[] = []
  if (d) {
    const start = rangeStartIndex(d.rows.dates, '1M')
    spark = d.rows.close.slice(start)
    if (quote?.source === 'intraday') spark = [...spark, quote.price]
  }
  return { item, quote, spark }
}

function StarButton({ on, name, onToggle }: { on: boolean; name: string; onToggle: () => void }) {
  return (
    <button type="button" className={`mk-star${on ? ' is-on' : ''}`} aria-pressed={on} aria-label={on ? `Remove ${name} from favourites` : `Add ${name} to favourites`} onClick={onToggle}>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    </button>
  )
}

export function Dashboard({ onOpen, onCompare }: { onOpen: (id: string) => void; onCompare: () => void }) {
  const { etfs, indexes, loading } = useEtfs()
  const [prefs, setPrefs] = usePrefs()
  const [editing, setEditing] = useState(false)
  const [query, setQuery] = useState('')
  const now = useMinute()
  const ids = useMemo(() => [...indexes.map((i) => i.id), ...etfs.map((e) => e.id)], [etfs, indexes])
  const daily = useDailyMany(ids)
  const asx = useIntraday('asx')
  const us = useIntraday('us')

  const indexRows = useMemo(() => indexes.map((i) => buildRow(i, daily, { asx, us })), [indexes, daily, asx, us])
  const etfRows = useMemo(() => etfs.map((e) => buildRow({ ...e, kind: 'etf' }, daily, { asx, us })), [etfs, daily, asx, us])

  const etfIds = useMemo(() => etfs.map((e) => e.id), [etfs])
  const sorted = useMemo(() => {
    const order = orderedIds(etfIds, prefs.order)
    const byId = new Map(etfRows.map((r) => [r.item.id, r]))
    const rows = order.map((id) => byId.get(id)).filter((r): r is Row => !!r)
    const pct = (r: Row) => r.quote?.pct ?? 0
    const by: Record<SortKey, (a: Row, b: Row) => number> = {
      mine: () => 0,
      up: (a, b) => pct(b) - pct(a),
      down: (a, b) => pct(a) - pct(b),
      name: (a, b) => a.item.id.localeCompare(b.item.id),
    }
    return [...rows].sort(by[prefs.sort])
  }, [etfRows, prefs.order, prefs.sort, etfIds])

  const sections = useMemo(
    () => watchSections(sorted, (r) => ({ id: r.item.id, name: r.item.name, category: r.item.kind === 'etf' ? r.item.category : undefined }), { favourites: prefs.favourites, grouped: prefs.grouped, query }),
    [sorted, prefs.favourites, prefs.grouped, query],
  )
  const searching = query.trim() !== ''
  const toggleGroup = (key: string) => setPrefs((p) => ({ collapsed: p.collapsed.includes(key) ? p.collapsed.filter((k) => k !== key) : [...p.collapsed, key] }))
  const toggleFav = (id: string) => setPrefs((p) => ({ favourites: p.favourites.includes(id) ? p.favourites.filter((f) => f !== id) : [...p.favourites, id] }))
  // Moving up puts the ETF just above the one shown above it (in its group), moving down just below.
  const move = (id: string, neighbour: string, side: 'before' | 'after') => setPrefs((p) => ({ order: moveIdNextTo(etfIds, p.order, id, neighbour, side), sort: 'mine' }))

  if (loading && etfs.length === 0) return <div className="loading">Loading prices…</div>
  if (etfs.length === 0)
    return (
      <section className="block">
        <p>No market data on this device yet. Connect to the internet and pull down (or tap Refresh) to download it.</p>
      </section>
    )

  const renderRow = (r: Row, i: number, list: Row[]) => {
    const unit = unitOf(r.item)
    const dir = direction(r.quote?.pct ?? 0)
    return (
      <li key={r.item.id} className="mk-row">
        <StarButton on={prefs.favourites.includes(r.item.id)} name={r.item.id} onToggle={() => toggleFav(r.item.id)} />
        <button type="button" className="mk-row-main" onClick={() => onOpen(r.item.id)}>
          <span className="mk-row-name">
            <strong>{r.item.id}</strong>
            <span>{r.item.name}</span>
          </span>
          <Sparkline values={r.spark} dir={dir} />
          <span className="mk-row-price">
            <strong>{r.quote ? priceText(r.quote.price, unit) : '–'}</strong>
            {r.quote && <ChangePill abs={r.quote.abs} pct={r.quote.pct} unit={unit} size="sm" />}
          </span>
          <span className="mk-row-meta">
            {r.quote && <span>{asOfText(r.quote.asOf, now)}</span>}
            <MarketBadge exchange={exchangeOf(r.item.market)} now={now} />
          </span>
        </button>
        {editing && prefs.sort === 'mine' && !searching && (
          <span className="mk-move">
            <button type="button" className="mk-move-btn" aria-label={`Move ${r.item.id} up`} disabled={i === 0} onClick={() => move(r.item.id, list[i - 1].item.id, 'before')}>
              ↑
            </button>
            <button type="button" className="mk-move-btn" aria-label={`Move ${r.item.id} down`} disabled={i === list.length - 1} onClick={() => move(r.item.id, list[i + 1].item.id, 'after')}>
              ↓
            </button>
          </span>
        )}
      </li>
    )
  }

  return (
    <>
      <section className="mk-markets" aria-label="Markets open or closed">
        <MarketBadge exchange="asx" now={now} long />
        <MarketBadge exchange="nyse" now={now} long />
        <Tip term="marketHours" />
      </section>

      <section aria-label="Indexes">
        <ul className="mk-index-grid">
          {indexRows.map((r) => {
            const unit = unitOf(r.item)
            return (
              <li key={r.item.id}>
                <button type="button" className="mk-index" onClick={() => onOpen(r.item.id)}>
                  <span className="mk-index-name">{r.item.name}</span>
                  <strong className="mk-index-value">{r.quote ? priceText(r.quote.price, unit) : '–'}</strong>
                  {r.quote && <ChangePill abs={r.quote.abs} pct={r.quote.pct} unit={unit} size="sm" />}
                  <Sparkline values={r.spark} dir={direction(r.quote?.pct ?? 0)} width={120} height={28} />
                  <span className="mk-index-meta">
                    {r.quote ? asOfText(r.quote.asOf, now) : ''} · <MarketBadge exchange={r.item.kind === 'fx' ? 'fx' : exchangeOf(r.item.market)} now={now} />
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="block mk-watch">
        <div className="block-head">
          <h2>Watchlist</h2>
          <div className="mk-watch-tools">
            <Select<SortKey>
              label="Sort the watchlist"
              value={prefs.sort}
              onChange={(sort) => setPrefs({ sort })}
              options={[
                { value: 'mine', label: 'My order' },
                { value: 'up', label: 'Biggest rise today' },
                { value: 'down', label: 'Biggest fall today' },
                { value: 'name', label: 'Name (A–Z)' },
              ]}
            />
            <button type="button" className="btn btn-quiet" aria-pressed={editing} onClick={() => setEditing((e) => !e)}>
              {editing ? 'Done' : 'Reorder'}
            </button>
          </div>
          {editing && prefs.sort !== 'mine' && <p className="block-hint">Choose “My order” to move ETFs up and down.</p>}
        </div>
        <div className="mk-watch-find">
          <label className="mk-search">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="m15.5 15.5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
              placeholder="Search by code or name"
              aria-label="Search the watchlist by code or name"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
            />
          </label>
          {!searching && <Toggle label="Group by type" checked={prefs.grouped} onChange={(on) => setPrefs({ grouped: on })} />}
        </div>
        {searching && sections[0].rows.length === 0 && <p className="mk-empty">No ETFs match “{query.trim()}”. Try a code like VAS or a word like “bond”.</p>}
        {sections.map((sec) => {
          if (sec.rows.length === 0) return null
          const foldable = !searching && sections.length > 1
          const open = !foldable || !prefs.collapsed.includes(sec.key)
          const listId = `mk-watch-${sec.key.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`
          return (
            <div key={sec.key} className="mk-group">
              {foldable ? (
                <h3 className="mk-list-head">
                  <button type="button" className="mk-group-btn" aria-expanded={open} aria-controls={listId} onClick={() => toggleGroup(sec.key)}>
                    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" className="mk-group-chev">
                      <path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span>{sec.title}</span>
                    <span className="mk-group-count">
                      <span className="visually-hidden">, </span>
                      {sec.rows.length}
                      <span className="visually-hidden"> {sec.rows.length === 1 ? 'ETF' : 'ETFs'}</span>
                    </span>
                  </button>
                </h3>
              ) : (
                (searching || sections.length > 1) && <h3 className="mk-list-head">{sec.title}</h3>
              )}
              {open && (
                <ul className="mk-list" id={listId}>
                  {sec.rows.map((r, i, l) => renderRow(r, i, l))}
                </ul>
              )}
            </div>
          )
        })}
        <p className="block-hint mk-star-hint">Tap ☆ to keep an ETF at the top. Tap an ETF for its chart, predictions and key facts.</p>
        <button type="button" className="btn btn-add" onClick={onCompare}>
          Compare ETFs on one chart
        </button>
      </section>
    </>
  )
}

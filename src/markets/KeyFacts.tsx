// Key facts about an ETF from data/etfs.json, each with the date it was checked and its source.

import type { EtfInfo, Fact } from '../data'
import { dayText } from './format'
import { Tip, type MarketWord } from './words'

const capital = (v: string) => v.charAt(0).toUpperCase() + v.slice(1)

function FactRow<T>({ label, fact, show, tip }: { label: string; fact: Fact<T> | undefined; show: (v: T) => string; tip?: MarketWord }) {
  if (!fact) return null
  return (
    <div className="mk-fact">
      <dt>
        {label}
        {tip && <Tip term={tip} />}
      </dt>
      <dd>
        <strong>{fact.value === null ? 'Not published' : show(fact.value)}</strong>
        {fact.verified === false && <span className="mk-estimate">estimate</span>}
        {fact.note && <span className="mk-fact-note">{fact.note}</span>}
        <span className="mk-fact-src">
          Checked {dayText(fact.checkedOn)} ·{' '}
          <a href={fact.source} target="_blank" rel="noreferrer">
            source
          </a>
        </span>
      </dd>
    </div>
  )
}

export function KeyFacts({ etf }: { etf: EtfInfo }) {
  return (
    <section className="block">
      <div className="block-head">
        <h2>Key facts</h2>
      </div>
      <dl className="mk-facts">
        <FactRow label="What it tracks" fact={etf.index} show={(v) => v} />
        <FactRow label="Management fee" fact={etf.mer} show={(v) => `${v}% a year`} tip="mer" />
        <FactRow label="Distribution yield" fact={etf.yield} show={(v) => `About ${v}% a year`} tip="yield" />
        <FactRow label="Franking" fact={etf.franking} show={(v) => `${v}% of distributions`} tip="franking" />
        <FactRow label="Distributions paid" fact={etf.distributions} show={capital} />
        <FactRow label="Started" fact={etf.inception} show={(v) => dayText(v)} />
        <FactRow label="Listed on" fact={etf.exchange} show={(v) => `${v}, in ${etf.currency === 'USD' ? 'US dollars' : 'Australian dollars'}`} />
        <FactRow
          label="What’s inside"
          fact={etf.allocation}
          show={(v) =>
            Object.entries(v)
              .map(([k, w]) => `${k} ${w}%`)
              .join(' · ')
          }
        />
        <FactRow label="Bond duration" fact={etf.duration} show={(v) => `About ${v} years (how sensitive it is to interest rates)`} />
      </dl>
    </section>
  )
}

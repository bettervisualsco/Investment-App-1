// Plain-English explanations behind the Markets tab's ⓘ buttons. Same look as the app's other ⓘ
// buttons (src/components/InfoTip.tsx); kept here so the Markets tab is self-contained.

import { useId } from 'react'

const marketWords = {
  totalReturn: {
    title: 'Price vs total return',
    body: 'Price only shows the unit price. Total return also counts the distributions the fund pays out, as if each one was reinvested. Total return is what your money actually earns, before tax.',
  },
  inAud: {
    title: 'Show in Australian dollars',
    body: 'US-listed funds are priced in US dollars. This converts every price with the exchange rate on that day, so it shows what an Australian investor actually saw, including currency ups and downs.',
  },
  averageYearly: {
    title: 'Average yearly return',
    body: 'The steady yearly rate that turns the start value into the end value (sometimes called CAGR). $100 growing to $121 over two years is 10% a year.',
  },
  volatility: {
    title: 'Volatility',
    body: 'How bumpy the ride was: the usual size of the ups and downs, as a yearly figure. Higher means bigger swings. Worked out from day-to-day changes.',
  },
  biggestDrop: {
    title: 'Biggest drop',
    body: 'The largest fall from a high point to a later low point during the period, before it recovered.',
  },
  bestWorstYear: {
    title: 'Best and worst year',
    body: 'Calendar years (January to December) completely inside the period you picked, from the last price of one year to the last price of the next.',
  },
  prediction: {
    title: 'Worst, likely and best',
    body: 'The app replays real history 2,000 times, picking random 12-month chunks of past months and joining them. Likely is the middle result. Worst is beaten by 9 in 10 replays (10th percentile), best by only 1 in 10 (90th percentile). An estimate based on history, not a promise.',
  },
  proxy: {
    title: 'Long-run history',
    body: 'Most ETFs are young, so before an ETF existed the app uses the index or asset type it follows (for example Australian shares since 1975), with the ETF’s fee taken off.',
  },
  mer: {
    title: 'Management fee (MER)',
    body: 'What the fund charges each year, as a % of your money. It comes out of the fund’s price a little every day, so the prices on this page are already after the fee.',
  },
  yield: {
    title: 'Distribution yield',
    body: 'Cash the fund paid out over the last year, as a % of its price. It changes over time.',
  },
  franking: {
    title: 'Franking',
    body: 'The share of distributions that comes with franking credits: tax Australian companies already paid. The credits reduce your tax, and can be refunded.',
  },
  marketHours: {
    title: 'Market hours',
    body: 'ASX: 10am–4pm Sydney time. New York (NYSE): 9:30am–4pm New York time. Shown in your own time, with daylight saving and public holidays from each exchange’s calendar. Prices are delayed by about 15–20 minutes.',
  },
} as const

export type MarketWord = keyof typeof marketWords

/** A small ⓘ button that opens a short explanation card. */
export function Tip({ term }: { term: MarketWord }) {
  const id = useId()
  const { title, body } = marketWords[term]
  return (
    <>
      <button type="button" className="info-btn" popoverTarget={id} aria-label={`What is “${title}”?`}>
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="8" cy="4.9" r="0.95" fill="currentColor" />
          <path d="M8 7.2v4.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      <div id={id} popover="auto" className="info-card" role="dialog" aria-label={title}>
        <h3>{title}</h3>
        <p>{body}</p>
        <button type="button" className="btn btn-quiet" popoverTarget={id} popoverTargetAction="hide">
          Got it
        </button>
      </div>
    </>
  )
}

/** An iOS-style switch with a label (same look as the Planner's switches). */
export function Toggle({ label, checked, onChange, info, disabled }: { label: string; checked: boolean; onChange: (on: boolean) => void; info?: MarketWord; disabled?: boolean }) {
  const id = useId()
  return (
    <div className={`mk-toggle${disabled ? ' is-disabled' : ''}`}>
      <span className="mk-toggle-label">
        <label htmlFor={id}>{label}</label>
        {info && <Tip term={info} />}
      </span>
      <label className="switch">
        <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span className="switch-track" aria-hidden="true" />
      </label>
    </div>
  )
}

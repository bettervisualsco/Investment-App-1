import { useMemo, useState } from 'react'
import { MoneyInput, Segmented, Select } from '../components/inputs'
import type { InflationFile } from '../data/types'
import { moneyExact } from '../lib/format'
import { pct } from './chartBits'
import { COUNTRY_NAME, CPI_SOURCE, yearLevels, type Country, type MonthlyChain } from './cpi'
import { growthBetween, MAX_YEARS } from './predict'
import { powerAnswer, type When } from './power'
import { getPrediction } from './predictionCache'
import { windowYears, type WindowChoice } from './window'
import { Tip } from './Tip'

export function PurchasingPower({ file, chains, choice }: { file: InflationFile; chains: Record<Country, MonthlyChain>; choice: WindowChoice }) {
  const [country, setCountry] = useState<Country>('au')
  const [amount, setAmount] = useState(10_000) // cents
  const [a, setA] = useState<When>('1990')
  const [b, setB] = useState<When>('now')

  const y = useMemo(() => yearLevels(file, country), [file, country])
  const latestYear = Math.floor(y.latest.m / 12)
  const options = useMemo(() => {
    const list: { value: When; label: string }[] = []
    for (let yr = y.first; yr <= y.lastFull; yr++) list.push({ value: String(yr), label: String(yr) })
    list.push({ value: 'now', label: `Now (${y.latest.label})` })
    for (let yr = latestYear + 1; yr <= latestYear + MAX_YEARS; yr++) list.push({ value: String(yr), label: `${yr} (estimate)` })
    return list.reverse()
  }, [y, latestYear])
  const valid = (w: When) => options.some((o) => o.value === w)
  const from = valid(a) ? a : 'now'
  const to = valid(b) ? b : 'now'

  const needsFuture = [from, to].some((w) => w !== 'now' && Number(w) > latestYear)
  const chain = chains[country]
  const answer = useMemo(() => {
    const future = needsFuture ? (f: number, t: number) => growthBetween(getPrediction(chain, choice), f, t) : null
    return powerAnswer(amount, from, to, y, future)
  }, [amount, from, to, y, needsFuture, chain, choice])

  const name = (w: When) => (w === 'now' ? 'now' : `in ${w}`)
  const currency = country === 'au' ? 'AUD' : 'USD'

  return (
    <section className="block infl-block" aria-labelledby="infl-power-title">
      <div className="block-head">
        <h2 id="infl-power-title">
          Buying power <Tip term="purchasingPower" />
        </h2>
        <p className="block-hint">What money in one year is worth in another year’s dollars.</p>
      </div>
      <div className="infl-controls">
        <Segmented<Country>
          label="Country"
          value={country}
          onChange={setCountry}
          options={[
            { value: 'au', label: 'Australia' },
            { value: 'us', label: 'US' },
          ]}
        />
      </div>
      <div className="infl-power-fields">
        <label>
          <span>Amount</span>
          <MoneyInput label="Amount" value={amount} onChange={setAmount} currency={currency} />
        </label>
        <label>
          <span>In</span>
          <Select<When> label="Year the money is from" value={from} onChange={setA} options={options} />
        </label>
        <button type="button" className="btn btn-quiet infl-swap" onClick={() => (setA(to), setB(from))} aria-label="Swap the two years">
          ⇅ Swap
        </button>
        <label>
          <span>is worth, in</span>
          <Select<When> label="Year to compare with" value={to} onChange={setB} options={options} />
        </label>
      </div>

      {answer && (
        <div className="infl-power-answer" aria-live="polite">
          <div className="infl-result-big">
            {answer.kind === 'estimate' && <span>about </span>}
            {moneyExact(Math.round(answer.value), currency)}
          </div>
          {answer.kind === 'exact' ? (
            <p>
              {moneyExact(amount, currency)} {name(from)} bought about the same as {moneyExact(Math.round(answer.value), currency)} {name(to)}.{' '}
              {from !== to && answer.rise !== undefined && (
                <>
                  Prices {answer.rise >= 0 ? 'rose' : 'fell'} {pct(Math.abs(answer.rise), Math.abs(answer.rise) > 1 ? 0 : 1)} in between
                  {answer.yearly !== undefined ? `, about ${pct(Math.abs(answer.yearly), 2)} a year` : ''}.
                </>
              )}
            </p>
          ) : (
            <p>
              {moneyExact(amount, currency)} {name(from)} might be worth about {moneyExact(Math.round(answer.value), currency)} {name(to)} (likely). Range:{' '}
              {moneyExact(Math.round(answer.low!), currency)} to {moneyExact(Math.round(answer.high!), currency)}, depending on how high inflation turns out. This is an estimate based on{' '}
              {COUNTRY_NAME[country]}’s inflation {windowYears(choice, chain)}, not a promise.
            </p>
          )}
        </div>
      )}
      <p className="fine-print">
        Past years use each year’s average {CPI_SOURCE[country]}; “now” is the latest figure ({y.latest.label}). Future years are counted from {y.latest.label}, so {latestYear + 10} means{' '}
        {y.latest.label.replace(String(latestYear), String(latestYear + 10))}.
      </p>
    </section>
  )
}

// "Money you have now": the starting balance, what it's invested in, what you paid and when you bought it.
// Two ways to enter it: one amount (simple) or a list of holdings (detailed). See src/engine/holdings.ts.

import { useId } from 'react'
import { PlusIcon, TrashIcon } from '../components/Icons'
import { InfoTip } from '../components/InfoTip'
import { Field, MoneyInput, NumberInput, Segmented, Select } from '../components/inputs'
import { useDataFile, type EtfsFile } from '../data'
import { parseISO, toDayNumber, toISO } from '../engine/dates'
import { resolveHoldingSettings } from '../engine/defaults'
import { DEFAULT_HOLDING_RETURN, hasSeparateHoldings, holdingHandling, isSeparate, startingTotal } from '../engine/holdings'
import type { Currency, DistributionSettings, Holding, HoldingDetails, Investment, Plan, Realism, StartingMoney } from '../engine/types'
import type { PlanProblem } from '../engine/validate'
import { newId } from '../lib/id'
import { dateLong, money } from '../lib/format'
import { holdingWithInvestment } from '../predict/etfFacts'
import { FactsLine, InvestmentFields } from './InvestmentPicker'
import { distFrequencyOptions, investmentName } from './investmentChoices'
import { Toggle } from './RealismPanel'
import './holdings.css'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** The first phase's return rate (where a new holding's expected return starts). */
function firstPhaseRate(plan: Plan): number {
  const r = plan.phases[0]?.returnRate
  if (!r) return DEFAULT_HOLDING_RETURN
  return r.kind === 'fixed' ? r.value : r.from
}

export function MoneyNow({
  plan,
  setPlan,
  realism,
  predicting,
  problems,
}: {
  plan: Plan
  setPlan: (p: Plan) => void
  realism: Realism
  predicting: boolean
  problems: PlanProblem[]
}) {
  const sm = plan.startingMoney
  const entry = sm?.entry ?? 'single'
  const holdings = sm?.holdings ?? []
  const { data: etfs } = useDataFile<EtfsFile>('etfs.json')
  const firstInv = plan.phases[0]?.investment
  const separate = hasSeparateHoldings(plan)
  const handling = holdingHandling(plan)

  /** Saves new "money you have now" settings, keeping the starting balance equal to the holdings' total. */
  const save = (next: StartingMoney, startingBalance = plan.startingBalance) => {
    const p: Plan = { ...plan, startingMoney: next, startingBalance }
    setPlan(next.entry === 'holdings' ? { ...p, startingBalance: startingTotal(p) } : p)
  }
  const base: StartingMoney = sm ?? { entry: 'single' }

  const switchEntry = (to: 'single' | 'holdings') => {
    if (to === entry) return
    if (to === 'holdings') {
      // The first time: the one amount (with its details) becomes the first holding.
      const list = holdings.length > 0 ? holdings : plan.startingBalance > 0 ? [{ ...(base.single ?? {}), id: newId(), value: plan.startingBalance }] : []
      save({ ...base, entry: 'holdings', holdings: list })
    } else {
      // Back to one amount: the same money, as one total.
      save({ ...base, entry: 'single' }, startingTotal(plan))
    }
  }

  const setHoldings = (list: Holding[]) => save({ ...base, entry: 'holdings', holdings: list })
  const updateHolding = (id: string, next: Holding) => setHoldings(holdings.map((h) => (h.id === id ? next : h)))

  const editorProps = { plan, realism, predicting, etfs, currency: plan.currency }
  const many = entry === 'holdings' ? holdings.filter((h) => isSeparate(plan, h)).length > 1 : false

  return (
    <section className="money-now" aria-labelledby="money-now-title">
      <div className="money-now-head">
        <h2 id="money-now-title">
          Money you have now <InfoTip term="moneyNow" />
        </h2>
        <Segmented
          label="How to enter it"
          value={entry}
          onChange={switchEntry}
          options={[
            { value: 'single', label: 'One amount' },
            { value: 'holdings', label: 'My holdings' },
          ]}
        />
      </div>

      {entry === 'single' ? (
        <div className="holding-fields">
          <Field label="Amount" htmlFor="plan-balance">
            <MoneyInput id="plan-balance" label="Money you have now" currency={plan.currency} value={plan.startingBalance} onChange={(startingBalance) => setPlan({ ...plan, startingBalance })} />
          </Field>
          <HoldingEditor {...editorProps} details={base.single ?? {}} value={plan.startingBalance} onChange={(single) => save({ ...base, single })} />
        </div>
      ) : (
        <>
          <p className="block-hint holdings-hint">
            List each thing you own, with today’s value. <InfoTip term="holding" />
          </p>
          {holdings.length > 0 && (
            <ul className="holding-list">
              {holdings.map((h, i) => (
                <li key={h.id} className="holding-card">
                  <div className="holding-top">
                    <input
                      className="input-text holding-name"
                      aria-label={`Name of holding ${i + 1}`}
                      placeholder={`Holding ${i + 1}`}
                      value={h.name ?? ''}
                      onChange={(e) => updateHolding(h.id, { ...h, name: e.target.value || undefined })}
                    />
                    <button type="button" className="icon-btn" aria-label={`Delete ${h.name || `holding ${i + 1}`}`} onClick={() => setHoldings(holdings.filter((x) => x.id !== h.id))}>
                      <TrashIcon />
                    </button>
                  </div>
                  <div className="holding-fields">
                    <Field label="Today’s value" htmlFor={`${h.id}-value`}>
                      <MoneyInput id={`${h.id}-value`} label={`Today’s value of holding ${i + 1}`} currency={plan.currency} value={h.value} onChange={(value) => updateHolding(h.id, { ...h, value })} />
                    </Field>
                    <HoldingEditor {...editorProps} details={h} value={h.value} onChange={(d) => updateHolding(h.id, { ...h, ...d })} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="btn btn-add" onClick={() => setHoldings([...holdings, { id: newId(), value: 0 }])}>
            <PlusIcon /> Add a holding
          </button>
          <p className="money-total">
            <span>Total, your starting balance</span>
            <strong>{money(startingTotal(plan), plan.currency)}</strong>
          </p>
        </>
      )}

      {separate && (
        <fieldset className="handling">
          <legend>
            {entry === 'single' ? 'It’s in something different from your first phase' : many ? 'Some holdings are in something different from your first phase' : 'One holding is in something different from your first phase'}{' '}
            <InfoTip term="keepOrMove" />
          </legend>
          <div className="choice-cards">
            <ChoiceCard
              name="money-handling"
              checked={handling === 'keep'}
              onPick={() => save({ ...base, handling: 'keep' })}
              title={entry === 'single' ? 'Keep it as it is' : 'Keep them as they are'}
              body={`${entry === 'single' ? 'Stays' : 'Each stays'} in its own investment for the whole plan, with its own ${predicting ? 'history' : 'return'}, fee and distributions. Your deposits and events still follow your phases.`}
            />
            <ChoiceCard
              name="money-handling"
              checked={handling === 'move'}
              onPick={() => save({ ...base, handling: 'move' })}
              title="Move into my plan’s investments"
              body={moveWords(plan, realism, firstInv)}
            />
          </div>
          {handling === 'keep' && (
            <p className="block-hint handling-note">
              Money taken out (withdrawals, and any sale to pay tax or fees) comes from every investment in proportion to its value. <InfoTip term="proRata" />
            </p>
          )}
        </fieldset>
      )}

      {problems.length > 0 && (
        <ul className="problems">
          {problems.map((p, i) => (
            <li key={i}>{p.message}</li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** What "Move into my plan's investments" will do, in words that match the switches that are on. */
function moveWords(plan: Plan, realism: Realism, firstInv: Investment | undefined): string {
  const date = dateLong(toDayNumber(plan.startDate))
  const into = firstInv ? investmentName(firstInv) : 'your first phase’s investment'
  const costs: string[] = []
  if (realism.tax) costs.push('capital gains tax on any gain (paid from the sale)')
  if (realism.fees) costs.push('brokerage and other trading costs on the sale and the buy')
  const tail = costs.length ? ` With your switches, that costs ${costs.join(', plus ')}.` : ' With Tax and Fees off, moving costs nothing.'
  return `Sold on ${date} and put into ${into}.${tail}`
}

function ChoiceCard({ name, checked, onPick, title, body }: { name: string; checked: boolean; onPick: () => void; title: string; body: string }) {
  const id = useId()
  return (
    <label className={checked ? 'choice-card is-on' : 'choice-card'} htmlFor={id}>
      <input id={id} type="radio" name={name} checked={checked} onChange={onPick} />
      <span className="choice-text">
        <span className="choice-title">{title}</span>
        <span className="choice-body">{body}</span>
      </span>
    </label>
  )
}

/** What it's in, what you paid, when you bought it, and (kept separately) its return, fee and distributions. */
function HoldingEditor({
  plan,
  realism,
  predicting,
  etfs,
  currency,
  details,
  value,
  onChange,
}: {
  plan: Plan
  realism: Realism
  predicting: boolean
  etfs: EtfsFile | undefined
  currency: Currency
  details: HoldingDetails
  value: number
  onChange: (d: HoldingDetails) => void
}) {
  const id = useId()
  const firstInv = plan.phases[0]?.investment
  const inv = details.investment
  const separate = isSeparate(plan, { ...details, id: '', value })
  const firstRate = firstPhaseRate(plan)
  // A holding that becomes separate starts at the first phase's return.
  const withRate = (d: HoldingDetails): HoldingDetails => (d.returnRate === undefined && d.investment ? { ...d, returnRate: firstRate } : d)
  const r = resolveHoldingSettings(details)
  const setDist = (patch: Partial<DistributionSettings>) => onChange({ ...details, distribution: { ...r.distribution, ...patch } })
  const cash = inv?.kind === 'cash'
  const moved = holdingHandling(plan) === 'move'
  const showCosts = separate && !cash && !moved && (realism.fees || realism.tax)

  return (
    <>
      <div className="holding-invest">
        <InvestmentFields
          inv={inv}
          etfs={etfs}
          label="What it’s in"
          customStart={firstRate}
          none={{ label: `Same as the first phase${firstInv ? ` (${investmentName(firstInv)})` : ''}`, onPick: () => onChange({ ...details, investment: undefined }) }}
          cashHint="Prediction mode uses the Reserve Bank cash rate from history instead. The interest is taxed as income."
          customHint="Manual mode uses the expected return below. Prediction mode makes up bumpy months with this average and volatility."
          onFilled={(next) => onChange(withRate(holdingWithInvestment(details, next, etfs, currency)))}
          onPlain={(next) => onChange(withRate({ ...details, investment: next }))}
        />
        {inv && !separate && <p className="block-hint">That’s the same as your first phase, so it’s simply part of your plan’s investment.</p>}
        {separate && !moved && (inv?.kind === 'etf' || inv?.kind === 'mix') && (
          <FactsLine inv={inv} etfs={etfs} currency={currency} where={realism.fees || realism.tax ? 'under “Its fee and distributions”' : 'once the Fees or Tax switch is on'} />
        )}
      </div>

      <div className="holding-grid">
        <Field label="What you paid" htmlFor={`${id}-cost`} info={<InfoTip term="costBase" />}>
          <MoneyInput id={`${id}-cost`} label="What you paid, including brokerage" currency={currency} value={details.costBase ?? value} onChange={(costBase) => onChange({ ...details, costBase })} />
        </Field>
        <Field label="Roughly when you bought it" htmlFor={`${id}-month`} info={<InfoTip term="boughtWhen" />}>
          <MonthYear id={`${id}-month`} value={details.boughtOn ?? plan.startDate} startDate={plan.startDate} onChange={(boughtOn) => onChange({ ...details, boughtOn })} />
        </Field>
        {separate && !moved && !predicting && !cash && (
          <Field label="Expected return" htmlFor={`${id}-ret`} info={<InfoTip term="holdingReturn" />}>
            <NumberInput id={`${id}-ret`} label="Expected return, Manual mode" value={details.returnRate ?? DEFAULT_HOLDING_RETURN} suffix="% a year" onChange={(returnRate) => onChange({ ...details, returnRate })} />
          </Field>
        )}
      </div>
      {details.costBase === undefined && details.boughtOn === undefined && (
        <p className="block-hint">Leave these as they are if you’re buying it on the start date. They matter with the Tax switch on.</p>
      )}

      {showCosts && (
        <details className="holding-more">
          <summary>Its fee and distributions</summary>
          <div className="holding-more-body">
            {realism.fees && (
              <>
                <Field label="Management fee (MER)" htmlFor={`${id}-mer`} info={<InfoTip term="mer" />}>
                  <NumberInput id={`${id}-mer`} label="Management fee" value={r.mer} min={0} suffix="% a year" onChange={(mer) => onChange({ ...details, mer })} />
                </Field>
                <Toggle label="Listed in the US" info="fxFee" hint="Pays the currency conversion fee when it’s sold." checked={r.usListed} onChange={(usListed) => onChange({ ...details, usListed })} />
              </>
            )}
            {realism.tax && (
              <>
                <h4 className="mini-head">
                  Distributions <InfoTip term="distribution" />
                </h4>
                <div className="realism-grid">
                  <Field label="Yield" htmlFor={`${id}-y`}>
                    <NumberInput id={`${id}-y`} label="Distribution yield" value={r.distribution.yield} min={0} suffix="% a year" onChange={(y) => setDist({ yield: y })} />
                  </Field>
                  <Field label="Paid" htmlFor={`${id}-f`}>
                    <Select id={`${id}-f`} label="Distributions paid" value={r.distribution.frequency} options={distFrequencyOptions} onChange={(frequency) => setDist({ frequency })} />
                  </Field>
                  <Field label="Franked" htmlFor={`${id}-fr`} info={<InfoTip term="franking" />}>
                    <NumberInput id={`${id}-fr`} label="Franked percent" value={r.distribution.frankedPct} min={0} suffix="%" onChange={(frankedPct) => setDist({ frankedPct })} />
                  </Field>
                  <Field label="Foreign income" htmlFor={`${id}-fo`} info={<InfoTip term="foreignTax" />}>
                    <NumberInput id={`${id}-fo`} label="Foreign income percent" value={r.distribution.foreignPct} min={0} suffix="%" onChange={(foreignPct) => setDist({ foreignPct })} />
                  </Field>
                  {r.distribution.foreignPct > 0 && (
                    <Field label="Foreign tax already taken" htmlFor={`${id}-ft`}>
                      <NumberInput id={`${id}-ft`} label="Foreign tax percent" value={r.distribution.foreignTaxPct} min={0} suffix="%" onChange={(foreignTaxPct) => setDist({ foreignTaxPct })} />
                    </Field>
                  )}
                </div>
                <p className="block-hint">Paid into this holding (reinvested) or to you, as set in Tax. The yield is part of its return, not extra.</p>
              </>
            )}
          </div>
        </details>
      )}
    </>
  )
}

/** Month and year boxes for "roughly when you bought it". Stored as the 1st of that month (or the start date, for the start month). */
function MonthYear({ id, value, startDate, onChange }: { id: string; value: string; startDate: string; onChange: (iso: string) => void }) {
  const { y, m } = parseISO(value)
  const set = (year: number, month: number) => {
    const iso = toISO({ y: year, m: month, d: 1 })
    const start = parseISO(startDate)
    // Picking the plan's start month means "bought on the start date".
    onChange(year === start.y && month === start.m ? startDate : iso)
  }
  return (
    <span className="month-year">
      <Select id={id} label="Month you bought it" value={String(m)} options={MONTHS.map((name, i) => ({ value: String(i + 1), label: name }))} onChange={(v) => set(y, Number(v))} />
      <NumberInput label="Year you bought it" width="sm" integer min={1900} value={y} onChange={(year) => year >= 1900 && year <= 9999 && set(year, m)} />
    </span>
  )
}

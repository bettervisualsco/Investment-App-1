import { useId } from 'react'
import { InfoTip } from '../components/InfoTip'
import type { GlossaryKey } from '../components/glossary'
import { PlusIcon, TrashIcon } from '../components/Icons'
import { Field, MoneyInput, NumberInput, Segmented, Select } from '../components/inputs'
import { resolveRealism } from '../engine/defaults'
import { addMonths, parseISO, toISO } from '../engine/dates'
import { ATO_TAX_YEARS, TAX_RATES_CHECKED_ON, TAX_SOURCES } from '../engine/taxTables'
import type { Brokerage, BrokerageTier, BuyFrequency, Currency, FeeSettings, Plan, Realism, TaxSettings, TaxYear } from '../engine/types'
import { financialYearLabel } from '../engine/manual'
import { dateLong } from '../lib/format'
import { toDayNumber } from '../engine/dates'
import { BROKERAGE_CHECKED_ON, brokeragePresets } from './brokeragePresets'
import type { HistoricalInflation } from './inflationHook'
import { realismOf } from './realismView'
import { VaryingEditor } from './VaryingEditor'
import './realism.css'

type Switch = 'fees' | 'tax' | 'inflation'

/** An iOS-style switch with a label. */
export function Toggle({ label, checked, onChange, info, hint }: { label: string; checked: boolean; onChange: (on: boolean) => void; info?: GlossaryKey; hint?: string }) {
  const id = useId()
  return (
    <div className="toggle-row">
      <div className="toggle-text">
        <span className="toggle-label">
          <label htmlFor={id}>{label}</label>
          {info && <InfoTip term={info} />}
        </span>
        {hint && <span className="toggle-hint">{hint}</span>}
      </div>
      <label className="switch">
        <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="switch-track" aria-hidden="true" />
      </label>
    </div>
  )
}

/** The Fees · Tax · Inflation switches, plus "Show the cost". Sits under the plan basics. */
export function RealismSwitches({ plan, setPlan }: { plan: Plan; setPlan: (p: Plan) => void }) {
  const r = realismOf(plan)
  const set = (patch: Partial<Realism>) => setPlan({ ...plan, realism: { ...r, ...patch } })
  const chips: { key: Switch; label: string }[] = [
    { key: 'fees', label: 'Fees' },
    { key: 'tax', label: 'Tax' },
    { key: 'inflation', label: 'Inflation' },
  ]
  const anyOn = r.fees || r.tax || r.inflation
  return (
    <div className="realism-bar" role="group" aria-label="Realism switches">
      <span className="realism-bar-title">
        Make it real <InfoTip term="realism" />
      </span>
      <div className="realism-chips">
        {chips.map((c) => (
          <button key={c.key} type="button" className={`chip${r[c.key] ? ' is-on' : ''}`} aria-pressed={r[c.key]} onClick={() => set({ [c.key]: !r[c.key] })}>
            <span className="chip-dot" aria-hidden="true" />
            {c.label}
          </button>
        ))}
        <button
          type="button"
          className={`chip chip-quiet${r.showCost ? ' is-on' : ''}`}
          aria-pressed={!!r.showCost}
          disabled={!anyOn}
          onClick={() => set({ showCost: !r.showCost })}
          title={anyOn ? undefined : 'Turn on a switch first'}
        >
          Show the cost
        </button>
        <InfoTip term="showCost" />
      </div>
    </div>
  )
}

/** Settings for each switch that is on. */
export function RealismSettings({
  plan,
  setPlan,
  historicalInflation,
}: {
  plan: Plan
  setPlan: (p: Plan) => void
  historicalInflation?: HistoricalInflation | null
}) {
  const r = realismOf(plan)
  const resolved = resolveRealism(plan)
  if (!r.fees && !r.tax && !r.inflation) return null
  const set = (patch: Partial<Realism>) => setPlan({ ...plan, realism: { ...r, ...patch } })
  const setFees = (patch: Partial<FeeSettings>) => set({ feeSettings: { ...resolved.feeSettings, ...patch } })
  const setTax = (patch: Partial<TaxSettings>) => set({ taxSettings: { ...resolved.taxSettings, ...patch } })

  return (
    <section className="block realism-settings" aria-labelledby="realism-title">
      <div className="block-head">
        <h2 id="realism-title">Fees, tax and inflation</h2>
        <p className="block-hint">Settings for the switches you’ve turned on. Each phase also has its own fee and tax details.</p>
      </div>
      {r.fees && (
        <details className="realism-group">
          <summary>Fees</summary>
          <FeeEditor fees={resolved.feeSettings} currency={plan.currency} onChange={setFees} />
        </details>
      )}
      {r.tax && (
        <details className="realism-group">
          <summary>Tax</summary>
          <TaxEditor tax={resolved.taxSettings} plan={plan} onChange={setTax} />
        </details>
      )}
      {r.inflation && (
        <details className="realism-group">
          <summary>Inflation</summary>
          <div className="realism-fields">
            <VaryingEditor
              name="Inflation rate"
              scopeWord="plan"
              isMoney={false}
              currency={plan.currency}
              value={resolved.inflationSettings.rate}
              onChange={(rate) => set({ inflationSettings: { rate } })}
            />
            <div className="hist-row">
              <button
                type="button"
                className="btn btn-quiet"
                disabled={!historicalInflation}
                onClick={() => historicalInflation && set({ inflationSettings: { rate: { kind: 'fixed', value: Math.round(historicalInflation.rate * 100) / 100 } } })}
              >
                Use historical average{historicalInflation ? ` (${historicalInflation.rate.toFixed(2)}%)` : ''}
              </button>
              <span className="toggle-hint">
                {historicalInflation ? historicalInflation.label : 'Waiting for the inflation data to download. Open the app online once to get it.'}
              </span>
            </div>
            <div className="block-hint">
              2.5% is the middle of the Reserve Bank’s 2–3% target, not a forecast. Results are shown in today’s dollars <InfoTip term="todaysDollars" />. To raise
              deposits with prices, turn on “Grow deposits with inflation” in a phase.
            </div>
          </div>
        </details>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Fees

const buyOptions: { value: BuyFrequency; label: string }[] = [
  { value: 'eachDeposit', label: 'Every time money comes in' },
  { value: 'weekly', label: 'Every week' },
  { value: 'fortnightly', label: 'Every fortnight' },
  { value: 'monthly', label: 'Every month' },
  { value: 'quarterly', label: 'Every quarter' },
  { value: 'yearly', label: 'Every year' },
]

function FeeEditor({ fees, currency, onChange }: { fees: FeeSettings; currency: Currency; onChange: (patch: Partial<FeeSettings>) => void }) {
  const id = useId()
  const preset = brokeragePresets.find((p) => p.id === fees.brokeragePreset)
  return (
    <div className="realism-fields">
      <Field label="Brokerage" htmlFor={`${id}-preset`} info={<InfoTip term="brokerage" />}>
        <Select
          id={`${id}-preset`}
          label="Brokerage preset"
          value={fees.brokeragePreset ?? 'custom'}
          options={[{ value: 'custom', label: 'My own numbers' }, ...brokeragePresets.map((p) => ({ value: p.id, label: p.name }))]}
          onChange={(v) => {
            const p = brokeragePresets.find((x) => x.id === v)
            if (!p) onChange({ brokeragePreset: undefined })
            else onChange({ brokeragePreset: p.id, brokerage: structuredClone(p.brokerage), ...(p.fxFeePct !== undefined ? { fxFeePct: p.fxFeePct } : {}) })
          }}
        />
      </Field>
      {preset && (
        <p className="check-fees">
          <strong>Check current fees.</strong> {preset.note} From{' '}
          <a href={preset.source} target="_blank" rel="noreferrer">
            {preset.name}’s website
          </a>{' '}
          on {dateLong(toDayNumber(BROKERAGE_CHECKED_ON))}.
        </p>
      )}
      <BrokerageEditor value={fees.brokerage} currency={currency} onChange={(brokerage) => onChange({ brokerage, brokeragePreset: undefined })} />

      <Field label="How often you buy" htmlFor={`${id}-buy`} info={<InfoTip term="buyFrequency" />}>
        <Select id={`${id}-buy`} label="How often you buy" value={fees.buyFrequency} options={buyOptions} onChange={(buyFrequency) => onChange({ buyFrequency })} />
      </Field>
      <Field label="Cash waiting to be invested earns" htmlFor={`${id}-cash`} info={<InfoTip term="cashRate" />}>
        <NumberInput id={`${id}-cash`} label="Cash rate" value={fees.cashRate} suffix="% a year" onChange={(cashRate) => onChange({ cashRate })} />
      </Field>
      <Field label="Currency conversion fee (US-listed)" htmlFor={`${id}-fx`} info={<InfoTip term="fxFee" />}>
        <NumberInput id={`${id}-fx`} label="Currency conversion fee" value={fees.fxFeePct} min={0} suffix="%" onChange={(fxFeePct) => onChange({ fxFeePct })} />
      </Field>
      <Field label="Account / platform fee" htmlFor={`${id}-plat`} info={<InfoTip term="platformFee" />}>
        <span className="inline-pair">
          <MoneyInput id={`${id}-plat`} label="Platform fee" currency={currency} value={fees.platformFee} onChange={(platformFee) => onChange({ platformFee })} />
          <Select
            label="Platform fee: how often"
            value={fees.platformFeePer}
            options={[
              { value: 'month', label: 'a month' },
              { value: 'year', label: 'a year' },
            ]}
            onChange={(platformFeePer) => onChange({ platformFeePer })}
          />
        </span>
      </Field>
      <Field label="Buy/sell spread" htmlFor={`${id}-spread`} info={<InfoTip term="spread" />}>
        <NumberInput id={`${id}-spread`} label="Buy/sell spread" value={fees.spreadPct} min={0} suffix="% a trade" onChange={(spreadPct) => onChange({ spreadPct })} />
      </Field>
    </div>
  )
}

function BrokerageEditor({ value, currency, onChange }: { value: Brokerage; currency: Currency; onChange: (b: Brokerage) => void }) {
  const id = useId()
  return (
    <div className="brokerage-editor">
      <Segmented
        label="Brokerage type"
        value={value.kind}
        options={[
          { value: 'flat', label: 'Flat $' },
          { value: 'percent', label: '%' },
          { value: 'tiered', label: 'Tiered' },
        ]}
        onChange={(kind) => {
          if (kind === value.kind) return
          if (kind === 'flat') onChange({ kind: 'flat', fee: 500 })
          else if (kind === 'percent') onChange({ kind: 'percent', pct: 0.1, min: 0 })
          else
            onChange({
              kind: 'tiered',
              tiers: [
                { upTo: 100_000, fee: 500, pct: 0 },
                { upTo: null, fee: 1_000, pct: 0 },
              ],
            })
        }}
      />
      {value.kind === 'flat' && (
        <Field label="Per trade" htmlFor={`${id}-flat`}>
          <MoneyInput id={`${id}-flat`} label="Brokerage per trade" currency={currency} value={value.fee} onChange={(fee) => onChange({ ...value, fee })} />
        </Field>
      )}
      {value.kind === 'percent' && (
        <span className="inline-pair">
          <Field label="% of each trade" htmlFor={`${id}-pct`}>
            <NumberInput id={`${id}-pct`} label="Brokerage percent" value={value.pct} min={0} suffix="%" onChange={(pct) => onChange({ ...value, pct })} />
          </Field>
          <Field label="But at least" htmlFor={`${id}-min`}>
            <MoneyInput id={`${id}-min`} label="Minimum brokerage" currency={currency} value={value.min} onChange={(min) => onChange({ ...value, min })} />
          </Field>
        </span>
      )}
      {value.kind === 'tiered' && <TierEditor tiers={value.tiers} currency={currency} onChange={(tiers) => onChange({ kind: 'tiered', tiers })} />}
    </div>
  )
}

function TierEditor({ tiers, currency, onChange }: { tiers: BrokerageTier[]; currency: Currency; onChange: (t: BrokerageTier[]) => void }) {
  const update = (i: number, patch: Partial<BrokerageTier>) => onChange(tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)))
  return (
    <div className="tier-list">
      {tiers.map((t, i) => {
        const last = i === tiers.length - 1
        return (
          <div className="tier-row" key={i}>
            <span className="tier-label">{last ? 'Bigger trades' : 'Up to'}</span>
            {!last && <MoneyInput label={`Tier ${i + 1}: trades up to`} currency={currency} value={t.upTo ?? 0} onChange={(upTo) => update(i, { upTo })} />}
            <span className="tier-label">cost</span>
            <MoneyInput label={`Tier ${i + 1}: fee`} currency={currency} value={t.fee} onChange={(fee) => update(i, { fee })} />
            <span className="tier-label">+</span>
            <NumberInput label={`Tier ${i + 1}: percent`} width="sm" value={t.pct} min={0} suffix="%" onChange={(pct) => update(i, { pct })} />
            {tiers.length > 1 && (
              <button
                type="button"
                className="icon-btn"
                aria-label={`Remove tier ${i + 1}`}
                onClick={() => {
                  const next = tiers.filter((_, j) => j !== i)
                  next[next.length - 1] = { ...next[next.length - 1], upTo: null }
                  onChange(next)
                }}
              >
                <TrashIcon />
              </button>
            )}
          </div>
        )
      })}
      <button
        type="button"
        className="btn btn-quiet"
        onClick={() => {
          const prevLimit = tiers.length > 1 ? (tiers[tiers.length - 2].upTo ?? 0) : 0
          const next = tiers.slice(0, -1)
          next.push({ ...tiers[tiers.length - 1], upTo: Math.max(prevLimit * 2, 100_000) })
          next.push({ upTo: null, fee: tiers[tiers.length - 1].fee, pct: tiers[tiers.length - 1].pct })
          onChange(next)
        }}
      >
        <PlusIcon /> Add a price band
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tax

function TaxEditor({ tax, plan, onChange }: { tax: TaxSettings; plan: Plan; onChange: (patch: Partial<TaxSettings>) => void }) {
  const id = useId()
  const start = parseISO(plan.startDate)
  return (
    <div className="realism-fields">
      <div className="estimate-note">
        A simplified estimate using ATO rates checked on {dateLong(toDayNumber(TAX_RATES_CHECKED_ON))}. Not tax advice. <InfoTip term="taxEstimate" />
      </div>
      <Field label="Work out tax from" info={<InfoTip term="taxBasis" />}>
        <Segmented
          label="Work out tax from"
          value={tax.basis}
          options={[
            { value: 'income', label: 'My other income' },
            { value: 'rate', label: 'A tax rate I pick' },
          ]}
          onChange={(basis) => onChange({ basis })}
        />
      </Field>
      <p className="block-hint">{tax.basis === 'income' ? 'Type your other yearly income in each phase.' : 'Pick your marginal tax rate in each phase.'}</p>
      <Toggle label="Medicare levy (2%)" info="medicare" checked={tax.medicare} onChange={(medicare) => onChange({ medicare })} />
      <Field label="Future tax brackets" info={<InfoTip term="brackets" />}>
        <Segmented
          label="Future tax brackets"
          value={tax.brackets}
          options={[
            { value: 'fixed', label: 'Stay the same' },
            { value: 'indexed', label: 'Rise with inflation' },
          ]}
          onChange={(brackets) => onChange({ brackets })}
        />
      </Field>
      {tax.brackets === 'indexed' && <p className="block-hint">Uses the inflation rate from the Inflation settings (even if the Inflation switch is off).</p>}
      <Field label="Distributions" info={<InfoTip term="reinvest" />}>
        <Segmented
          label="Distributions"
          value={tax.distributions}
          options={[
            { value: 'reinvest', label: 'Reinvest after tax' },
            { value: 'cash', label: 'Take as cash' },
          ]}
          onChange={(distributions) => onChange({ distributions })}
        />
      </Field>
      <Field label="At the end of the plan" info={<InfoTip term="atEnd" />}>
        <Segmented
          label="At the end of the plan"
          value={tax.atEnd}
          options={[
            { value: 'hold', label: 'Don’t sell' },
            { value: 'sell', label: 'Sell everything' },
          ]}
          onChange={(atEnd) => onChange({ atEnd })}
        />
      </Field>
      <Field label="Capital gains rules" info={<InfoTip term="cgt2027" />}>
        <Segmented
          label="Capital gains rules"
          value={tax.cgtRules}
          options={[
            { value: 'law', label: 'New law from July 2027' },
            { value: 'discount', label: 'Keep the 50% discount' },
          ]}
          onChange={(cgtRules) => onChange({ cgtRules })}
        />
      </Field>
      {tax.cgtRules === 'law' && <Toggle label="Minimum 30% tax on gains from July 2027" info="minimumTax" checked={tax.cgtMinimum} onChange={(cgtMinimum) => onChange({ cgtMinimum })} />}
      <Field label="Who owns the investment" info={<InfoTip term="under18" />}>
        <Segmented
          label="Who owns the investment"
          value={tax.owner}
          options={[
            { value: 'adult', label: 'An adult' },
            { value: 'minor', label: 'Someone under 18' },
          ]}
          onChange={(owner) => onChange({ owner, turns18On: tax.turns18On ?? toISO(addMonths(start, 60)) })}
        />
      </Field>
      {tax.owner === 'minor' && (
        <>
          <Field label="Turns 18 on" htmlFor={`${id}-18`}>
            <input
              id={`${id}-18`}
              type="date"
              className="input-text input-date"
              value={tax.turns18On ?? ''}
              onChange={(e) => e.target.value && onChange({ turns18On: e.target.value })}
            />
          </Field>
          <Field label="The money came from">
            <Segmented
              label="The money came from"
              value={tax.minorMoney}
              options={[
                { value: 'family', label: 'Family or gifts' },
                { value: 'own', label: 'Their own job' },
              ]}
              onChange={(minorMoney) => onChange({ minorMoney })}
            />
          </Field>
          <p className="block-hint">
            {tax.minorMoney === 'family'
              ? 'Special under-18 rates apply to the investment income in each financial year they are under 18 on 30 June. If a parent really controls the money, the parent may have to declare it instead.'
              : 'Income from investing their own job earnings is “excepted income”, taxed at normal adult rates.'}
          </p>
        </>
      )}
      <TaxTableEditor tax={tax} onChange={onChange} />
    </div>
  )
}

function TaxTableEditor({ tax, onChange }: { tax: TaxSettings; onChange: (patch: Partial<TaxSettings>) => void }) {
  const tables = tax.tables && tax.tables.length > 0 ? tax.tables : ATO_TAX_YEARS
  const edited = !!tax.tables && tax.tables.length > 0
  const setYear = (fy: number, next: TaxYear) => onChange({ tables: tables.map((t) => (t.fy === fy ? next : t)) })
  return (
    <details className="tax-tables">
      <summary>
        Tax rates used {edited && <span className="badge">edited</span>}
      </summary>
      <p className="block-hint">
        Resident rates from{' '}
        <a href={TAX_SOURCES.rates} target="_blank" rel="noreferrer">
          ato.gov.au
        </a>
        , checked {dateLong(toDayNumber(TAX_RATES_CHECKED_ON))}. 2027–28 (the 14% rate) is already law and is used for every later year. Medicare thresholds for 2026–27 and later aren’t
        published yet, so 2025–26’s are used for every later year. You can change any number.
      </p>
      {tables.map((t) => (
        <div className="tax-year" key={t.fy}>
          <h4>{t.fy === tables[tables.length - 1].fy ? `${financialYearLabel(t.fy)} and later` : financialYearLabel(t.fy)}</h4>
          <table className="year-table tax-year-table">
            <thead>
              <tr>
                <th scope="col">Income over</th>
                <th scope="col">Rate on each extra $1</th>
              </tr>
            </thead>
            <tbody>
              {t.brackets.map((b, i) => (
                <tr key={i}>
                  <th scope="row">
                    {i === 0 ? (
                      '$0'
                    ) : (
                      <MoneyInput
                        label={`${financialYearLabel(t.fy)} bracket ${i + 1} starts above`}
                        value={b.over * 100}
                        onChange={(c) => setYear(t.fy, { ...t, brackets: t.brackets.map((x, j) => (j === i ? { ...x, over: Math.round(c / 100) } : x)) })}
                      />
                    )}
                  </th>
                  <td>
                    <NumberInput
                      label={`${financialYearLabel(t.fy)} bracket ${i + 1} rate`}
                      width="sm"
                      value={b.rate}
                      min={0}
                      suffix="%"
                      onChange={(rate) => setYear(t.fy, { ...t, brackets: t.brackets.map((x, j) => (j === i ? { ...x, rate } : x)) })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="inline-pair">
            <Field label="Medicare levy">
              <NumberInput label={`${financialYearLabel(t.fy)} Medicare levy`} width="sm" value={t.medicare.rate} min={0} suffix="%" onChange={(rate) => setYear(t.fy, { ...t, medicare: { ...t.medicare, rate } })} />
            </Field>
            <Field label="No levy up to">
              <MoneyInput
                label={`${financialYearLabel(t.fy)} Medicare lower threshold`}
                value={t.medicare.lowerThreshold * 100}
                onChange={(c) => setYear(t.fy, { ...t, medicare: { ...t.medicare, lowerThreshold: Math.round(c / 100) } })}
              />
            </Field>
            <Field label="Low income offset up to">
              <MoneyInput label={`${financialYearLabel(t.fy)} LITO maximum`} value={t.lito.max * 100} onChange={(c) => setYear(t.fy, { ...t, lito: { ...t.lito, max: Math.round(c / 100) } })} />
            </Field>
          </div>
        </div>
      ))}
      <p className="block-hint">
        Under 18 (investment income from family money): nothing to $416, 66% of the excess to $1,307, then 45% of the whole amount (
        <a href={TAX_SOURCES.minors} target="_blank" rel="noreferrer">
          ATO
        </a>
        ). Franking credits use the 30% company rate.
      </p>
      {edited && (
        <button type="button" className="btn btn-quiet" onClick={() => onChange({ tables: undefined })}>
          Reset to the ATO rates
        </button>
      )}
    </details>
  )
}

import { useId } from 'react'
import { InfoTip } from '../components/InfoTip'
import { Field, MoneyInput, NumberInput, Select } from '../components/inputs'
import { resolvePhase } from '../engine/defaults'
import type { Currency, DistributionSettings, Phase, Realism } from '../engine/types'
import { distFrequencyOptions } from './investmentChoices'
import { Toggle } from './RealismPanel'


const rateOptions = [
  { value: '0', label: '0% (income up to $18,200)' },
  { value: '15', label: '15% ($18,201–$45,000 in 2026–27)' },
  { value: '14', label: '14% ($18,201–$45,000 from 2027–28)' },
  { value: '30', label: '30% ($45,001–$135,000)' },
  { value: '37', label: '37% ($135,001–$190,000)' },
  { value: '45', label: '45% (over $190,000)' },
  { value: 'other', label: 'Another rate…' },
]

/** The fee, tax and inflation settings for one phase. Only the parts for switches that are on are shown. */
export function PhaseRealism({
  phase,
  realism,
  taxBasis,
  currency,
  onChange,
}: {
  phase: Phase
  realism: Realism
  taxBasis: 'income' | 'rate'
  currency: Currency
  onChange: (p: Phase) => void
}) {
  const id = useId()
  if (!realism.fees && !realism.tax && !realism.inflation) return null
  const r = resolvePhase(phase)
  const cash = phase.investment?.kind === 'cash'
  const filled = phase.investment?.kind === 'etf' || phase.investment?.kind === 'mix'
  const setDist = (patch: Partial<DistributionSettings>) => onChange({ ...phase, distribution: { ...r.distribution, ...patch } })
  const presetRate = rateOptions.some((o) => o.value === String(r.marginalRate))

  return (
    <div className="phase-realism">
      {realism.fees && cash && (
        <>
          <h3 className="sub-head">Fees in this phase</h3>
          <p className="block-hint">A savings account has no management fee or brokerage. The platform fee still applies.</p>
        </>
      )}
      {realism.fees && !cash && (
        <>
          <h3 className="sub-head">Fees in this phase</h3>
          <Field label="Management fee (MER)" htmlFor={`${id}-mer`} info={<InfoTip term="mer" />}>
            <NumberInput id={`${id}-mer`} label="Management fee" value={r.mer} min={0} suffix="% a year" onChange={(mer) => onChange({ ...phase, mer })} />
          </Field>
          <p className="block-hint">
            {filled ? 'Filled in from the ETF’s details. You can change it.' : 'Example value. Use your investment’s fee (choosing an ETF above fills it in).'}
          </p>
          <Toggle label="Listed in the US" info="fxFee" hint="Pays the currency conversion fee on each buy and sale." checked={r.usListed} onChange={(usListed) => onChange({ ...phase, usListed })} />
        </>
      )}

      {realism.tax && (
        <>
          <h3 className="sub-head">
            Tax in this phase <InfoTip term="taxEstimate" />
          </h3>
          {taxBasis === 'income' ? (
            <Field label="Your other taxable income" htmlFor={`${id}-inc`} info={<InfoTip term="otherIncome" />}>
              <span className="inline-pair">
                <MoneyInput id={`${id}-inc`} label="Other taxable income a year" currency={currency} value={r.otherIncome} onChange={(otherIncome) => onChange({ ...phase, otherIncome })} />
                <span className="toggle-hint">a year</span>
              </span>
            </Field>
          ) : (
            <Field label="Your marginal tax rate" htmlFor={`${id}-rate`} info={<InfoTip term="marginalRate" />}>
              <span className="inline-pair">
                <Select
                  id={`${id}-rate`}
                  label="Marginal tax rate"
                  value={presetRate ? String(r.marginalRate) : 'other'}
                  options={rateOptions}
                  onChange={(v) => v !== 'other' && onChange({ ...phase, marginalRate: Number(v) })}
                />
                {!presetRate && <NumberInput label="Marginal tax rate (%)" width="sm" value={r.marginalRate} min={0} suffix="%" onChange={(marginalRate) => onChange({ ...phase, marginalRate })} />}
              </span>
            </Field>
          )}
          {cash ? (
            <p className="block-hint">The interest is taxed as income in the financial year it’s paid (monthly).</p>
          ) : (
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
          <p className="block-hint">
            {filled ? 'Filled in from the ETF’s details. ' : 'Example values. '}The yield is part of the return, not extra. For an Australian shares ETF, franking is often 60–80%; a
            US-listed ETF is 100% foreign income with 15% US tax taken.
          </p>
            </>
          )}
        </>
      )}

      {realism.inflation && (
        <>
          <h3 className="sub-head">Inflation in this phase</h3>
          <Toggle
            label="Grow deposits with inflation"
            info="growWithInflation"
            checked={r.growWithInflation}
            onChange={(growWithInflation) => onChange({ ...phase, growWithInflation })}
          />
        </>
      )}
    </div>
  )
}

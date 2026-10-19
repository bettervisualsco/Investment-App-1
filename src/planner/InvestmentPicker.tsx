import { useId } from 'react'
import { PlusIcon, TrashIcon } from '../components/Icons'
import { Field, NumberInput, Select } from '../components/inputs'
import { useDataFile, type EtfsFile } from '../data'
import type { Currency, CustomAsset, Investment, MixPart, Phase } from '../engine/types'
import { dateLong } from '../lib/format'
import { toDayNumber } from '../engine/dates'
import { factsFor, withInvestment } from '../predict/etfFacts'
import { HelpTip } from '../predict/HelpTip'
import { etfChoices, type EtfChoices } from './investmentChoices'
import { Toggle } from './RealismPanel'

type Kind = Investment['kind'] | 'none'

const kindOptions: { value: Kind; label: string }[] = [
  { value: 'etf', label: 'One ETF' },
  { value: 'mix', label: 'A mix of ETFs' },
  { value: 'cash', label: 'Cash / savings account' },
  { value: 'custom', label: 'Custom asset' },
]

/** Starting values when you switch to a kind. `rate` is the return to start a custom asset at. */
function starter(kind: Investment['kind'], rate: number, firstEtf: string): Investment {
  if (kind === 'etf') return { kind: 'etf', etf: firstEtf }
  if (kind === 'mix') return { kind: 'mix', parts: [{ etf: firstEtf, weight: 70 }, { etf: firstEtf === 'VAS' ? 'VGS' : 'VAS', weight: 30 }] }
  if (kind === 'cash') return { kind: 'cash', rate: 4 }
  return { kind: 'custom', mean: rate, volatility: 15 }
}

/** An ETF drop-down: grouped by category when the data has categories, and always showing the chosen ETF. */
export function EtfSelect({ id, label, value, choices, onChange }: { id?: string; label: string; value: string; choices: EtfChoices; onChange: (etf: string) => void }) {
  // Keep a chosen ETF visible even if it has left the watchlist.
  const missing = choices.all.some((o) => o.value === value) ? [] : [{ value, label: `${value} (not in the watchlist)` }]
  if (choices.groups) return <Select id={id} label={label} value={value} options={missing} groups={choices.groups} onChange={onChange} />
  return <Select id={id} label={label} value={value} options={[...missing, ...choices.all]} onChange={onChange} />
}

/**
 * The "what it's invested in" controls, shared by phases and by money you have now: the kind, then the ETF, the mix,
 * the savings rate or the custom asset.
 * - onFilled: an ETF or a mix was chosen (the caller fills in its fee and distributions).
 * - onPlain: cash or a custom asset (nothing to fill in).
 * - none: the extra first choice (e.g. "Same as the first phase") and what picking it does.
 */
export function InvestmentFields({
  inv,
  etfs,
  customStart,
  none,
  label = 'Invested in',
  cashHint,
  customHint,
  onFilled,
  onPlain,
}: {
  inv: Investment | undefined
  etfs: EtfsFile | undefined
  /** Average return a new custom asset starts at, % a year. */
  customStart: number
  none?: { label: string; onPick?: () => void }
  label?: string
  cashHint?: string
  customHint?: string
  onFilled: (inv: Investment) => void
  onPlain: (inv: Investment) => void
}) {
  const id = useId()
  const choices = etfChoices(etfs)
  const firstEtf = choices.all[0]?.value ?? 'VAS'
  const kind: Kind = inv?.kind ?? 'none'
  const options = none ? [{ value: 'none' as Kind, label: none.label }, ...kindOptions] : kindOptions
  return (
    <>
      <Field label={label} htmlFor={`${id}-kind`}>
        <Select
          id={`${id}-kind`}
          label={label}
          value={kind}
          options={options}
          onChange={(k) => {
            if (k === 'none') return none?.onPick?.()
            const next = starter(k, customStart, firstEtf)
            if (k === 'etf' || k === 'mix') onFilled(next)
            else onPlain(next)
          }}
        />
      </Field>

      {inv?.kind === 'etf' && (
        <Field label="ETF" htmlFor={`${id}-etf`}>
          <EtfSelect id={`${id}-etf`} label="ETF" value={inv.etf} choices={choices} onChange={(etf) => onFilled({ kind: 'etf', etf })} />
        </Field>
      )}

      {inv?.kind === 'mix' && <MixEditor parts={inv.parts} choices={choices} onChange={(parts) => onFilled({ kind: 'mix', parts })} />}

      {inv?.kind === 'cash' && (
        <>
          <Field label="Savings rate (Manual mode)" htmlFor={`${id}-cash`} info={<HelpTip term="cash" />}>
            <NumberInput id={`${id}-cash`} label="Savings rate" value={inv.rate} min={0} suffix="% a year" onChange={(rate) => onPlain({ kind: 'cash', rate })} />
          </Field>
          {cashHint && <p className="block-hint">{cashHint}</p>}
        </>
      )}

      {inv?.kind === 'custom' && <CustomEditor asset={inv} hint={customHint} onChange={onPlain} />}
    </>
  )
}

/** "What it's invested in" for one phase. */
export function InvestmentPicker({ phase, currency, onChange }: { phase: Phase; currency: Currency; onChange: (p: Phase) => void }) {
  const { data: etfs } = useDataFile<EtfsFile>('etfs.json')
  const inv = phase.investment
  const rate = phase.returnRate.kind === 'fixed' ? phase.returnRate.value : phase.returnRate.from
  return (
    <div className="invest">
      <h3 className="sub-head">
        What it’s invested in <HelpTip term="investment" />
      </h3>
      <InvestmentFields
        inv={inv}
        etfs={etfs}
        customStart={rate}
        none={inv ? undefined : { label: 'Not chosen yet' }}
        cashHint="Prediction mode uses the Reserve Bank cash rate from history instead. No management fee or brokerage, and the interest is taxed as income."
        customHint="Manual mode uses the return rate below. Prediction mode makes up bumpy months with this average and volatility."
        onFilled={(next) => onChange(withInvestment(phase, next, etfs, currency))}
        // Custom assets and cash keep the fee and distribution settings you have (nothing to fill in).
        onPlain={(next) => onChange({ ...phase, investment: next })}
      />
      {(inv?.kind === 'etf' || inv?.kind === 'mix') && <FactsLine inv={inv} etfs={etfs} currency={currency} />}
      {!inv && <p className="block-hint">Manual mode uses the return rate below. Choose an investment to use Prediction mode.</p>}
    </div>
  )
}

export function FactsLine({ inv, etfs, currency, where = 'under Fees and Tax in this phase' }: { inv: Investment; etfs: EtfsFile | undefined; currency: Currency; where?: string }) {
  if (!etfs) return <p className="block-hint">ETF details load with the market data.</p>
  const f = factsFor(inv, etfs, currency)
  if (!f) return null
  return (
    <p className="block-hint invest-facts">
      Filled in: fee {f.mer}% a year, yield {f.yield}%, {f.frankedPct}% franked{f.usListed ? ', pays the currency fee' : ''}
      {f.checkedOn ? ` (checked ${dateLong(toDayNumber(f.checkedOn))})` : ''}. You can change them {where}.
      {f.gaps.length > 0 && ` Not published or estimated: ${f.gaps.join(', ')}.`}
    </p>
  )
}

function MixEditor({ parts, choices, onChange }: { parts: MixPart[]; choices: EtfChoices; onChange: (parts: MixPart[]) => void }) {
  const id = useId()
  const total = parts.reduce((s, p) => s + p.weight, 0)
  const update = (i: number, patch: Partial<MixPart>) => onChange(parts.map((p, j) => (j === i ? { ...p, ...patch } : p)))
  const unused = choices.all.find((o) => !parts.some((p) => p.etf === o.value))
  return (
    <div className="mix">
      <div className="mix-head">
        <span>Mix</span> <HelpTip term="mix" />
      </div>
      <ul className="mix-list">
        {parts.map((p, i) => (
          <li key={i} className="mix-row">
            <EtfSelect id={`${id}-${i}`} label={`ETF ${i + 1}`} value={p.etf} choices={choices} onChange={(etf) => update(i, { etf })} />
            <NumberInput label={`Share of ETF ${i + 1}`} width="sm" value={p.weight} min={0} suffix="%" onChange={(weight) => update(i, { weight })} />
            {parts.length > 1 && (
              <button type="button" className="icon-btn" aria-label={`Remove ${p.etf}`} onClick={() => onChange(parts.filter((_, j) => j !== i))}>
                <TrashIcon />
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="mix-foot">
        <span className={Math.abs(total - 100) < 0.01 ? 'mix-total' : 'mix-total is-off'}>Total {Math.round(total * 100) / 100}%</span>
        {unused && (
          <button type="button" className="btn btn-quiet" onClick={() => onChange([...parts, { etf: unused.value, weight: Math.max(0, 100 - total) }])}>
            <PlusIcon /> Add an ETF
          </button>
        )}
      </div>
      <p className="block-hint">Put back to these shares once a year.</p>
    </div>
  )
}

function CustomEditor({ asset, hint, onChange }: { asset: CustomAsset; hint?: string; onChange: (a: CustomAsset) => void }) {
  const id = useId()
  return (
    <div className="custom-asset">
      <div className="block-hint">
        Describe your own investment <HelpTip term="custom" />
      </div>
      <div className="realism-grid">
        <Field label="Average return" htmlFor={`${id}-mean`}>
          <NumberInput id={`${id}-mean`} label="Average yearly return" value={asset.mean} suffix="% a year" onChange={(mean) => onChange({ ...asset, mean })} />
        </Field>
        <Field label="Volatility" htmlFor={`${id}-vol`} info={<HelpTip term="volatility" />}>
          <NumberInput id={`${id}-vol`} label="Volatility" value={asset.volatility} min={0} suffix="% a year" onChange={(volatility) => onChange({ ...asset, volatility })} />
        </Field>
      </div>
      <Toggle
        label="Sudden crashes"
        hint="Big one-month falls now and then"
        checked={!!asset.crashes}
        onChange={(on) => onChange({ ...asset, crashes: on ? { everyYears: 10, drop: 30 } : undefined })}
      />
      {asset.crashes && (
        <div className="realism-grid">
          <Field label="About once every" htmlFor={`${id}-every`} info={<HelpTip term="crashes" />}>
            <NumberInput id={`${id}-every`} label="Years between crashes" value={asset.crashes.everyYears} min={1} suffix="years" onChange={(everyYears) => onChange({ ...asset, crashes: { ...asset.crashes!, everyYears } })} />
          </Field>
          <Field label="Falling by" htmlFor={`${id}-drop`}>
            <NumberInput id={`${id}-drop`} label="Crash size" value={asset.crashes.drop} min={0} suffix="% in a month" onChange={(drop) => onChange({ ...asset, crashes: { ...asset.crashes!, drop } })} />
          </Field>
        </div>
      )}
      {hint && <p className="block-hint">{hint}</p>}
    </div>
  )
}

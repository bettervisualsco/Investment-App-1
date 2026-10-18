import { useId } from 'react'
import { InfoTip } from '../components/InfoTip'
import { Field, MoneyInput, NumberInput, Segmented, Select } from '../components/inputs'
import type { Currency, CurveShape, Duration, Varying } from '../engine/types'
import { durationUnitOptions } from './words'

type Kind = Varying['kind']

const curveOptions: { value: CurveShape; label: string }[] = [
  { value: 'linear', label: 'Straight line' },
  { value: 'slowThenFast', label: 'Slow, then fast' },
  { value: 'fastThenSlow', label: 'Fast, then slow' },
]

function baseOf(v: Varying): number {
  return v.kind === 'fixed' ? v.value : v.from
}

/** Switch kind, keeping the starting number the person already typed. */
function convert(v: Varying, kind: Kind, isMoney: boolean): Varying {
  const base = baseOf(v)
  if (kind === 'fixed') return { kind: 'fixed', value: base }
  if (kind === 'ramp') return { kind: 'ramp', from: base, to: isMoney ? base * 2 || 10_000 : base, shape: 'linear' }
  return { kind: 'steps', from: base, stepBy: isMoney ? 2_000 : 0.5, every: { count: 6, unit: 'months' } }
}

export function DurationInput({ value, onChange, label, min = 1 }: { value: Duration; onChange: (d: Duration) => void; label: string; min?: number }) {
  return (
    <span className="duration-input">
      <NumberInput value={value.count} integer min={min} width="sm" label={`${label}: number`} onChange={(count) => onChange({ ...value, count })} />
      <Select value={value.unit} options={durationUnitOptions(value.count)} label={`${label}: unit`} onChange={(unit) => onChange({ ...value, unit })} />
    </span>
  )
}

/** Edits a deposit amount or a return rate that may change during a phase. */
export function VaryingEditor({
  value,
  onChange,
  isMoney,
  currency,
  name,
  scopeWord = 'phase',
}: {
  value: Varying
  onChange: (v: Varying) => void
  isMoney: boolean
  currency: Currency
  /** e.g. "Deposit" or "Return rate", used in labels */
  name: string
  /** What the change happens over: "phase" (default) or "plan". */
  scopeWord?: string
}) {
  const id = useId()

  const amount = (n: number, set: (n: number) => void, label: string, inputId?: string, allowNegative = false) =>
    isMoney ? (
      <MoneyInput id={inputId} value={n} onChange={set} currency={currency} label={label} allowNegative={allowNegative} />
    ) : (
      <NumberInput id={inputId} value={n} onChange={set} label={label} suffix="% a year" />
    )

  const windowEditor = (v: Exclude<Varying, { kind: 'fixed' }>) => {
    const partial = v.startAfter !== undefined || v.lasts !== undefined
    return (
      <>
        <Field label="When" info={<InfoTip term="changeWindow" />}>
          <Segmented
            label={`${name}: when it changes`}
            value={partial ? 'part' : 'whole'}
            options={[
              { value: 'whole', label: `Whole ${scopeWord}` },
              { value: 'part', label: 'Part of it' },
            ]}
            onChange={(w) =>
              onChange(
                w === 'whole'
                  ? { ...v, startAfter: undefined, lasts: undefined }
                  : { ...v, startAfter: { count: 1, unit: 'years' }, lasts: { count: 2, unit: 'years' } },
              )
            }
          />
        </Field>
        {partial && (
          <>
            <Field label="Starts after">
              <DurationInput label={`${name}: starts after`} min={0} value={v.startAfter ?? { count: 0, unit: 'years' }} onChange={(startAfter) => onChange({ ...v, startAfter })} />
            </Field>
            <Field label="Takes">
              <DurationInput label={`${name}: takes`} value={v.lasts ?? { count: 1, unit: 'years' }} onChange={(lasts) => onChange({ ...v, lasts })} />
            </Field>
          </>
        )}
      </>
    )
  }

  return (
    <div className="varying">
      <Field label={`Over this ${scopeWord}`} info={<InfoTip term="changeOverTime" />}>
        <Segmented
          label={`${name}: change over time`}
          value={value.kind}
          options={[
            { value: 'fixed', label: 'Same' },
            { value: 'ramp', label: 'Ramp' },
            { value: 'steps', label: 'Steps' },
          ]}
          onChange={(kind) => kind !== value.kind && onChange(convert(value, kind, isMoney))}
        />
      </Field>

      {value.kind === 'fixed' && (
        <Field label={name} htmlFor={`${id}-v`}>
          {amount(value.value, (n) => onChange({ ...value, value: n }), name, `${id}-v`)}
        </Field>
      )}

      {value.kind === 'ramp' && (
        <>
          <Field label="Start at" htmlFor={`${id}-f`}>
            {amount(value.from, (n) => onChange({ ...value, from: n }), `${name}: start at`, `${id}-f`)}
          </Field>
          <Field label="End at" htmlFor={`${id}-t`}>
            {amount(value.to, (n) => onChange({ ...value, to: n }), `${name}: end at`, `${id}-t`)}
          </Field>
          <Field label="Curve" info={<InfoTip term="curve" />}>
            <Select label={`${name}: curve`} value={value.shape} options={curveOptions} onChange={(shape) => onChange({ ...value, shape })} />
          </Field>
          {windowEditor(value)}
        </>
      )}

      {value.kind === 'steps' && (
        <>
          <Field label="Start at" htmlFor={`${id}-f`}>
            {amount(value.from, (n) => onChange({ ...value, from: n }), `${name}: start at`, `${id}-f`)}
          </Field>
          <Field label="Change by" htmlFor={`${id}-s`}>
            {amount(value.stepBy, (n) => onChange({ ...value, stepBy: n }), `${name}: change by`, `${id}-s`, true)}
          </Field>
          <Field label="Every">
            <DurationInput label={`${name}: every`} value={value.every} onChange={(every) => onChange({ ...value, every })} />
          </Field>
          {windowEditor(value)}
        </>
      )}
    </div>
  )
}

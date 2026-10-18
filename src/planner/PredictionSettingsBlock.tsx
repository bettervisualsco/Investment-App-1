import { useId } from 'react'
import { Field, NumberInput, Select } from '../components/inputs'
import type { HistoryWindowKind, Plan } from '../engine/types'
import { MAX_RUNS, MIN_RUNS } from '../engine/validate'
import { HelpTip } from '../predict/HelpTip'
import type { HistoryInfo } from '../predict/history'
import { newSeed, withPrediction, type ResolvedPrediction } from '../predict/settingsStore'
import { percentileName } from './words'

const windowOptions: { value: HistoryWindowKind; label: string }[] = [
  { value: 'full', label: 'Full history' },
  { value: 'since1950', label: 'Since 1950' },
  { value: 'since1990', label: 'Since 1990' },
  { value: 'last20', label: 'The last 20 years' },
  { value: 'custom', label: 'Choose the years…' },
]

const presets: [number, number, number][] = [
  [10, 50, 90],
  [5, 50, 95],
  [25, 50, 75],
  [1, 50, 99],
]
const presetLabel = (p: readonly number[]) => p.map(percentileName).join(' / ')

/** Prediction settings for this plan: which history, chunk length, simulations, percentiles and seed. */
export function PredictionSettingsBlock({
  plan,
  setPlan,
  settings,
  history,
  historyProblem,
}: {
  plan: Plan
  setPlan: (p: Plan) => void
  settings: ResolvedPrediction
  history: HistoryInfo | null
  historyProblem: string | null
}) {
  const id = useId()
  const set = (patch: Parameters<typeof withPrediction>[1]) => setPlan(withPrediction(plan, patch))
  const presetKey = presets.find((p) => p.join() === settings.percentiles.join())?.join() ?? 'custom'
  const [lo, mid, hi] = settings.percentiles
  const setPct = (i: number, value: number) => {
    const next = [...settings.percentiles] as [number, number, number]
    next[i] = value
    set({ percentiles: next })
  }

  return (
    <section className="block predict-settings" aria-labelledby={`${id}-title`}>
      <div className="block-head">
        <h2 id={`${id}-title`}>
          Prediction settings <HelpTip term="predictionMode" />
        </h2>
        <p className="block-hint">Your phases, deposits and events stay as they are. Only returns, inflation and exchange rates follow history.</p>
      </div>

      <Field label="History to replay" htmlFor={`${id}-win`} info={<HelpTip term="history" />}>
        <Select id={`${id}-win`} label="History to replay" value={settings.window} options={windowOptions} onChange={(window) => set({ window, windowFrom: settings.windowFrom, windowTo: settings.windowTo })} />
      </Field>
      {settings.window === 'custom' && (
        <div className="realism-grid">
          <Field label="From the start of" htmlFor={`${id}-from`}>
            <NumberInput id={`${id}-from`} label="First year" integer width="sm" value={settings.windowFrom} onChange={(windowFrom) => set({ windowFrom })} />
          </Field>
          <Field label="To the end of" htmlFor={`${id}-to`}>
            <NumberInput id={`${id}-to`} label="Last year" integer width="sm" value={settings.windowTo} onChange={(windowTo) => set({ windowTo })} />
          </Field>
        </div>
      )}
      {history && <p className={`block-hint${history.clipped ? ' predict-clipped' : ''}`}>{history.note}</p>}
      {historyProblem && <p className="block-hint predict-clipped">{historyProblem}</p>}

      <div className="realism-grid">
        <Field label="Chunks of" htmlFor={`${id}-block`} info={<HelpTip term="block" />}>
          <NumberInput id={`${id}-block`} label="Chunk length in months" integer min={1} width="sm" value={settings.blockMonths} suffix="months" onChange={(blockMonths) => set({ blockMonths })} />
        </Field>
        <Field label="Simulations" htmlFor={`${id}-runs`} info={<HelpTip term="simulations" />}>
          <NumberInput id={`${id}-runs`} label="Number of simulations" integer min={1} value={settings.runs} onChange={(runs) => set({ runs })} />
        </Field>
      </div>
      {(settings.runs < MIN_RUNS || settings.runs > MAX_RUNS) && (
        <p className="block-hint predict-clipped">
          Use {MIN_RUNS.toLocaleString('en-AU')} to {MAX_RUNS.toLocaleString('en-AU')} simulations.
        </p>
      )}

      <Field label="Worst / likely / best" htmlFor={`${id}-pct`} info={<HelpTip term="percentiles" />}>
        <Select
          id={`${id}-pct`}
          label="Percentiles"
          value={presetKey}
          options={[...presets.map((p) => ({ value: p.join(), label: presetLabel(p) })), { value: 'custom', label: 'Other…' }]}
          onChange={(v) => {
            if (v === 'custom') set({ percentiles: [Math.max(1, lo === 10 ? 15 : lo), mid, hi] })
            else set({ percentiles: v.split(',').map(Number) as [number, number, number] })
          }}
        />
      </Field>
      {presetKey === 'custom' && (
        <div className="realism-grid predict-pcts">
          <Field label="Worst" htmlFor={`${id}-lo`}>
            <NumberInput id={`${id}-lo`} label="Worst percentile" width="sm" value={lo} min={1} suffix="th" onChange={(n) => setPct(0, n)} />
          </Field>
          <Field label="Likely" htmlFor={`${id}-mid`}>
            <NumberInput id={`${id}-mid`} label="Likely percentile" width="sm" value={mid} min={1} suffix="th" onChange={(n) => setPct(1, n)} />
          </Field>
          <Field label="Best" htmlFor={`${id}-hi`}>
            <NumberInput id={`${id}-hi`} label="Best percentile" width="sm" value={hi} min={1} suffix="th" onChange={(n) => setPct(2, n)} />
          </Field>
        </div>
      )}

      <div className="predict-seed">
        <span>
          Random seed <strong>{settings.seed}</strong>
          {settings.defaultSeed ? ' (the usual one, from Settings)' : ''} <HelpTip term="seed" />
        </span>
        <span className="predict-seed-actions">
          <button type="button" className="btn btn-quiet" onClick={() => set({ seed: newSeed() })}>
            Re-roll
          </button>
          {!settings.defaultSeed && (
            <button type="button" className="btn btn-quiet" onClick={() => set({ seed: undefined })}>
              Use the usual seed
            </button>
          )}
        </span>
      </div>
      <div className="block-hint">
        Defaults for new plans (percentiles, simulations, seed) are in Settings. ETF histories already have each fund’s fee taken out; the app adds it back so the Fees switch never counts it
        twice <HelpTip term="historyFees" />.
      </div>
    </section>
  )
}

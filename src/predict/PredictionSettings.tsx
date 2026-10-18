import { useId, useState } from 'react'
import { Field, NumberInput, Select } from '../components/inputs'
import { MAX_RUNS, MIN_RUNS } from '../engine/validate'
import { HelpTip } from './HelpTip'
import { BUILT_IN_DEFAULTS, newSeed, setPredictionDefaults, usePredictionDefaults } from './settingsStore'

const presets: { value: string; label: string }[] = [
  { value: '10,50,90', label: '10th / 50th / 90th (usual)' },
  { value: '5,50,95', label: '5th / 50th / 95th (wider)' },
  { value: '25,50,75', label: '25th / 50th / 75th (narrower)' },
  { value: '1,50,99', label: '1st / 50th / 99th (extremes)' },
]

/** Settings → Predictions: the defaults Prediction mode uses unless a plan sets its own. */
export function PredictionSettings() {
  const id = useId()
  const d = usePredictionDefaults()
  const [runsText, setRunsText] = useState<number | null>(null)
  const key = d.percentiles.join()
  const options = presets.some((p) => p.value === key) ? presets : [{ value: key, label: d.percentiles.join(' / ') }, ...presets]
  const shownRuns = runsText ?? d.runs
  const runsOk = Number.isInteger(shownRuns) && shownRuns >= MIN_RUNS && shownRuns <= MAX_RUNS
  return (
    <section className="block">
      <div className="block-head">
        <h2>Predictions</h2>
        <p className="block-hint">Used by Prediction mode in the Planner, unless a plan has its own settings.</p>
      </div>
      <Field label="Worst / likely / best" htmlFor={`${id}-pct`} info={<HelpTip term="percentiles" />}>
        <Select id={`${id}-pct`} label="Default percentiles" value={key} options={options} onChange={(v) => setPredictionDefaults({ percentiles: v.split(',').map(Number) as [number, number, number] })} />
      </Field>
      <Field label="Simulations" htmlFor={`${id}-runs`} info={<HelpTip term="simulations" />}>
        <NumberInput
          id={`${id}-runs`}
          label="Default number of simulations"
          integer
          min={1}
          value={shownRuns}
          onChange={(runs) => {
            setRunsText(runs)
            if (runs >= MIN_RUNS && runs <= MAX_RUNS) {
              setPredictionDefaults({ runs })
              setRunsText(null)
            }
          }}
        />
      </Field>
      {!runsOk && (
        <p className="block-hint" style={{ color: 'var(--warn)' }}>
          Use {MIN_RUNS.toLocaleString('en-AU')} to {MAX_RUNS.toLocaleString('en-AU')}. Still using {d.runs.toLocaleString('en-AU')}.
        </p>
      )}
      <Field label="Random seed" htmlFor={`${id}-seed`} info={<HelpTip term="seed" />}>
        <span className="inline-pair">
          <NumberInput id={`${id}-seed`} label="Random seed" integer min={0} value={d.seed} onChange={(seed) => setPredictionDefaults({ seed })} />
          <button type="button" className="btn btn-quiet" onClick={() => setPredictionDefaults({ seed: newSeed() })}>
            New seed
          </button>
        </span>
      </Field>
      <button type="button" className="btn btn-quiet settings-link" onClick={() => setPredictionDefaults(BUILT_IN_DEFAULTS)}>
        Back to the usual settings (10th / 50th / 90th, {BUILT_IN_DEFAULTS.runs.toLocaleString('en-AU')} simulations, seed {BUILT_IN_DEFAULTS.seed})
      </button>
    </section>
  )
}

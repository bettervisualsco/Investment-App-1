import { Segmented } from '../components/inputs'
import { DataStatus } from '../markets/DataStatus'
import { TAX_RATES_CHECKED_ON, TAX_SOURCES } from '../engine/taxTables'
import { toDayNumber } from '../engine/dates'
import { dateLong } from '../lib/format'
import type { ThemeChoice } from '../state/theme'

export const DISCLAIMER = 'General information only, not financial advice. Predictions are estimates based on past data, and the future can be different.'

export function ComingSoon({ title, stage, what }: { title: string; stage: number; what: string }) {
  return (
    <div className="page-simple">
      <h1>{title}</h1>
      <p className="lead">{what}</p>
      <p className="block-hint">This arrives in stage {stage} of the build.</p>
    </div>
  )
}

export function SettingsPage({ theme, setTheme, onShowSaved }: { theme: ThemeChoice; setTheme: (t: ThemeChoice) => void; onShowSaved: () => void }) {
  return (
    <div className="page-simple">
      <h1>Settings</h1>
      <section className="block">
        <div className="block-head">
          <h2>Appearance</h2>
        </div>
        <Segmented
          label="Appearance"
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'auto', label: 'Automatic' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
      </section>
      <DataStatus />
      <section className="block">
        <div className="block-head">
          <h2>Your plans</h2>
        </div>
        <p>Your plans are saved on this device only, never online. To move them to your other device, or keep a safe copy, make a backup file in the Saved tab.</p>
        <button type="button" className="btn btn-quiet settings-link" onClick={onShowSaved}>
          Go to Saved plans
        </button>
      </section>
      <section className="block">
        <div className="block-head">
          <h2>Tax rates</h2>
        </div>
        <p>
          Tax rates were checked on the ATO website on {dateLong(toDayNumber(TAX_RATES_CHECKED_ON))}. You can change any rate in the Planner, under the Tax settings.
        </p>
        <p className="block-hint">
          Sources:{' '}
          <a href={TAX_SOURCES.rates} target="_blank" rel="noreferrer">
            ATO tax rates
          </a>{' '}
          and{' '}
          <a href={TAX_SOURCES.cgtReform} target="_blank" rel="noreferrer">
            capital gains tax changes from July 2027
          </a>
          .
        </p>
      </section>
      <section className="block">
        <div className="block-head">
          <h2>About</h2>
        </div>
        <p>{DISCLAIMER}</p>
      </section>
    </div>
  )
}

export function DisclaimerSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="sheet-backdrop" role="presentation">
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="disclaimer-title">
        <h2 id="disclaimer-title">Before you start</h2>
        <p>{DISCLAIMER}</p>
        <button type="button" className="btn btn-primary" onClick={onClose} autoFocus>
          I understand
        </button>
      </div>
    </div>
  )
}

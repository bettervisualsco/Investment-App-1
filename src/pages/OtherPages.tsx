import { Segmented } from '../components/inputs'
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

export function SettingsPage({ theme, setTheme }: { theme: ThemeChoice; setTheme: (t: ThemeChoice) => void }) {
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
      <section className="block">
        <div className="block-head">
          <h2>About</h2>
        </div>
        <p>{DISCLAIMER}</p>
        <p className="block-hint">Your plans are saved on this device only.</p>
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

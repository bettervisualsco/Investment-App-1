import { useRef, useState } from 'react'
import { DownloadIcon } from '../components/Icons'
import { newId } from '../lib/id'
import type { SavedPlanRecord } from '../state/db'
import { putImported } from '../state/plans'
import { planImport, readBackup, resolveImport, type ConflictChoice, type ImportItem, type SkippedPlan } from './backup'
import { changedOn, exportPlans } from './actions'
import { readTextFile } from './files'
import { HelpTip, Sheet } from './ui'

type ImportState =
  | { step: 'error'; message: string }
  | { step: 'review'; items: ImportItem[]; skipped: SkippedPlan[]; exportedAt: string | null }
  | { step: 'done'; message: string }

export function BackupSection({ saved, currentUnsaved }: { saved: SavedPlanRecord[]; currentUnsaved: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState('')
  const [importing, setImporting] = useState<ImportState | null>(null)

  const onFile = async (file: File | undefined) => {
    if (input.current) input.current.value = '' // so picking the same file again still works
    if (!file) return
    let text: string
    try {
      text = await readTextFile(file)
    } catch {
      setImporting({ step: 'error', message: 'That file couldn’t be opened. If it’s in iCloud Drive, make sure it has finished downloading, then try again.' })
      return
    }
    const read = readBackup(text)
    if (!read.ok) {
      setImporting({ step: 'error', message: read.error })
      return
    }
    setImporting({ step: 'review', items: planImport(read.entries, saved, newId), skipped: read.skipped, exportedAt: read.exportedAt })
  }

  return (
    <section className="block" aria-labelledby="backup-title">
      <div className="block-head">
        <h2 id="backup-title">
          Back up and move plans <HelpTip term="backup" />
        </h2>
        <p className="block-hint">Plans are kept on this device only. A backup file moves them between your iPhone and Mac, or keeps a safe copy.</p>
      </div>
      <div className="saved-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={saved.length === 0}
          onClick={() => exportPlans(saved).then(setMessage, () => setMessage('The backup couldn’t be saved. Please try again.'))}
        >
          <DownloadIcon /> Back up all plans{saved.length ? ` (${saved.length})` : ''}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => input.current?.click()}>
          Import a backup
        </button>
        <input ref={input} type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      </div>
      {message && (
        <p className="saved-flash" role="status">
          {message}
        </p>
      )}
      {currentUnsaved && saved.length > 0 && <p className="saved-note">The plan in the Planner has changes that aren’t saved, so they won’t be in the backup. Save it first if you want them.</p>}
      <p className="block-hint saved-how">
        <strong>iPhone:</strong> after tapping Back up, choose “Save to Files”, or AirDrop it to your Mac. <strong>Mac:</strong> the file goes to Downloads. On the other device, tap Import a backup and pick the file.
      </p>

      {importing && <ImportSheet state={importing} onClose={() => setImporting(null)} onDone={(m) => setImporting({ step: 'done', message: m })} />}
    </section>
  )
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function ImportSheet({ state, onClose, onDone }: { state: ImportState; onClose: () => void; onDone: (message: string) => void }) {
  const [choice, setChoice] = useState<ConflictChoice>('keepBoth')
  const [busy, setBusy] = useState(false)

  if (state.step === 'error') {
    return (
      <Sheet title="Can’t import this file" onClose={onClose}>
        <p>{state.message}</p>
        <p className="block-hint">Nothing on this device was changed.</p>
        <button type="button" className="btn btn-primary" onClick={onClose}>
          OK
        </button>
      </Sheet>
    )
  }

  if (state.step === 'done') {
    return (
      <Sheet title="Import finished" onClose={onClose}>
        <p role="status">{state.message}</p>
        <button type="button" className="btn btn-primary" onClick={onClose}>
          Done
        </button>
      </Sheet>
    )
  }

  const { items, skipped, exportedAt } = state
  const count = (s: ImportItem['status']) => items.filter((i) => i.status === s).length
  const fresh = count('new')
  const different = count('different')
  const same = count('same')
  const willWrite = fresh + (choice === 'skip' ? 0 : different)

  const run = async () => {
    setBusy(true)
    const outcome = resolveImport(items, choice, newId)
    try {
      await putImported(outcome.put)
    } catch {
      setBusy(false)
      onDone('Something went wrong while saving, so nothing was imported. Please try again.')
      return
    }
    const parts = [
      outcome.added && `${plural(outcome.added, 'plan', 'plans')} added`,
      outcome.keptBoth && `${plural(outcome.keptBoth, 'plan', 'plans')} added alongside the one already here (marked “from backup”)`,
      outcome.replaced && `${plural(outcome.replaced, 'plan', 'plans')} replaced`,
      outcome.skipped && `${plural(outcome.skipped, 'plan', 'plans')} skipped`,
      outcome.alreadyHere && `${plural(outcome.alreadyHere, 'plan was', 'plans were')} already here`,
    ].filter(Boolean)
    onDone(`${parts.join(', ')}.`.replace(/^./, (c) => c.toUpperCase()))
  }

  return (
    <Sheet title="Import plans" onClose={onClose} wide>
      <p>
        This backup{exportedAt && Number.isFinite(Date.parse(exportedAt)) ? ` from ${changedOn(Date.parse(exportedAt))}` : ''} has {plural(items.length, 'plan', 'plans')}
        {skipped.length ? ` that can be read, plus ${skipped.length} that can’t` : ''}.
      </p>

      {items.length > 0 && (
        <ul className="import-list">
          {items.map((item, i) => (
            <li key={i}>
              <span className="import-name">{item.entry.plan.name.trim() || 'Untitled plan'}</span>
              {item.status === 'new' && <span className="pill pill-good">New</span>}
              {item.status === 'same' && <span className="pill">Already here</span>}
              {item.status === 'different' && (
                <>
                  <span className="pill pill-warn">Different</span>
                  <span className="import-dates">
                    Here: changed {changedOn(item.existing.updatedAt)}. In the file: changed {changedOn(item.entry.updatedAt)}.
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {skipped.length > 0 && (
        <div className="saved-note">
          <p>These can’t be read and will be left out:</p>
          <ul>
            {skipped.map((s, i) => (
              <li key={i}>
                {s.name}: {s.reason}.
              </li>
            ))}
          </ul>
        </div>
      )}

      {different > 0 && (
        <fieldset className="import-choice">
          <legend>
            {different === 1 ? '1 plan is different from the one on this device.' : `${different} plans are different from the ones on this device.`} What should happen?{' '}
            <HelpTip term="importChoices" />
          </legend>
          {(
            [
              ['keepBoth', 'Keep both', 'Add the file’s version as a separate plan. Nothing here changes.'],
              ['replace', 'Replace the one here', 'The version on this device is swapped for the file’s version.'],
              ['skip', 'Skip', 'Leave the one here as it is.'],
            ] as const
          ).map(([value, label, hint]) => (
            <label key={value} className={`import-option${choice === value ? ' is-on' : ''}`}>
              <input type="radio" name="import-choice" value={value} checked={choice === value} onChange={() => setChoice(value)} />
              <span>
                <strong>{label}</strong>
                <span className="block-hint">{hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      {willWrite === 0 ? (
        <>
          <p className="block-hint">{same > 0 && fresh === 0 && different === 0 ? 'Everything in this file is already on this device.' : 'Nothing to import.'}</p>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            OK
          </button>
        </>
      ) : (
        <div className="saved-actions">
          <button type="button" className="btn btn-primary" onClick={run} disabled={busy}>
            {busy ? 'Importing…' : `Import ${plural(willWrite, 'plan', 'plans')}`}
          </button>
          <button type="button" className="btn btn-quiet" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
      )}
    </Sheet>
  )
}

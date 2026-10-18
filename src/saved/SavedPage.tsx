import { useMemo, useState } from 'react'
import { CopyIcon, DownloadIcon, PlusIcon, TrashIcon } from '../components/Icons'
import type { Plan } from '../engine/types'
import { dateMonthYear, money } from '../lib/format'
import { newId } from '../lib/id'
import type { SavedPlanRecord } from '../state/db'
import { blankPlan } from '../state/defaultPlan'
import { COPY_SUFFIX, deletePlan, duplicatePlan, renamePlan, savePlan } from '../state/plans'
import { changedOn, exportPlans } from './actions'
import { BackupSection } from './BackupSection'
import { MAX_COMPARE, runPlan, type PlanOutcome } from './compare'
import { CompareView } from './CompareView'
import { displayName, saveStatus } from './status'
import { HelpTip, Sheet } from './ui'
import './saved.css'

type Popup =
  | { kind: 'menu'; rec: SavedPlanRecord }
  | { kind: 'rename'; rec: SavedPlanRecord }
  | { kind: 'delete'; rec: SavedPlanRecord }
  | { kind: 'unsaved'; then: () => void }
  | { kind: 'revert' }

export function SavedPage({
  plan,
  setPlan,
  saved,
  openPlanner,
}: {
  plan: Plan | null
  setPlan: (p: Plan) => void
  saved: SavedPlanRecord[] | null
  openPlanner: () => void
}) {
  const [view, setView] = useState<'list' | 'compare'>('list')
  const [picked, setPicked] = useState<string[]>([])
  const [popup, setPopup] = useState<Popup | null>(null)
  const [flash, setFlash] = useState('')

  const summaries = useMemo(() => new Map((saved ?? []).map((r) => [r.id, runPlan(r.plan)])), [saved])
  // Only plans that still exist (one might have been deleted).
  const pickedPlans = useMemo(() => picked.map((id) => saved?.find((r) => r.id === id)?.plan).filter((p): p is Plan => !!p), [picked, saved])

  if (!saved || !plan) return <div className="loading">Loading your plans…</div>

  const status = saveStatus(plan, saved)
  const savedCopy = saved.find((r) => r.id === plan.id)
  const close = () => setPopup(null)
  const say = (text: string) => setFlash(text)

  /** Runs `then`, but first offers to save the Planner's plan if it has unsaved work. */
  const afterSaveCheck = (then: () => void) => {
    if (status === 'saved') then()
    else setPopup({ kind: 'unsaved', then })
  }

  const open = (p: Plan) => {
    if (p.id === plan.id) return openPlanner() // Already open: keep any edits.
    afterSaveCheck(() => {
      setPlan(structuredClone(p))
      openPlanner()
    })
  }

  const saveCurrent = async () => {
    await savePlan(plan)
    say(`Saved “${displayName(plan)}”.`)
  }

  const saveAsNew = async () => {
    // Only add "(copy)" if another saved plan already has this name.
    const taken = saved.some((r) => displayName(r.plan) === displayName(plan))
    const copy = { ...plan, id: newId(), name: taken ? `${displayName(plan)}${COPY_SUFFIX}` : displayName(plan) }
    setPlan(copy)
    await savePlan(copy)
    say(`Saved as a new plan, “${copy.name}”. The Planner now shows the new one.`)
  }

  const togglePick = (id: string) => setPicked((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : ids.length < MAX_COMPARE ? [...ids, id] : ids))
  const pickedIds = pickedPlans.map((p) => p.id)

  if (view === 'compare' && pickedPlans.length >= 2) {
    return (
      <>
        <CompareView plans={pickedPlans} onBack={() => setView('list')} onOpen={open} />
        {popup && <Popups popup={popup} plan={plan} close={close} setPopup={setPopup} setPlan={setPlan} savedCopy={savedCopy} say={say} />}
      </>
    )
  }

  return (
    <div className="page-wide saved">
      <h1 className="saved-title">Saved plans</h1>

      <section className="block current-card" aria-labelledby="current-title">
        <p className="eyebrow">Open in the Planner</p>
        <div className="current-row">
          <h2 id="current-title" className="current-name">
            {displayName(plan)}
          </h2>
          <StatusPill status={status} />
        </div>
        <p className="block-hint">
          {status === 'new' && 'Not in your saved plans yet. The Planner remembers it, but saving keeps a copy here you can always come back to.'}
          {status === 'changed' && 'You’ve changed it since you last saved it.'}
          {status === 'saved' && 'Everything is saved.'}
        </p>
        <div className="saved-actions">
          {status !== 'saved' && (
            <button type="button" className="btn btn-primary" onClick={saveCurrent}>
              {status === 'new' ? 'Save this plan' : 'Save changes'}
            </button>
          )}
          {status !== 'new' && (
            <button type="button" className="btn btn-secondary" onClick={saveAsNew}>
              <CopyIcon /> Save as a new plan
            </button>
          )}
          {status === 'changed' && (
            <button type="button" className="btn btn-quiet" onClick={() => setPopup({ kind: 'revert' })}>
              Undo changes
            </button>
          )}
          <button type="button" className="btn btn-quiet" onClick={() => afterSaveCheck(() => (setPlan(blankPlan()), openPlanner()))}>
            <PlusIcon /> New plan
          </button>
        </div>
        {flash && (
          <p className="saved-flash" role="status">
            {flash}
          </p>
        )}
      </section>

      <section className="block" aria-labelledby="list-title">
        <div className="block-head">
          <h2 id="list-title">
            Your plans{saved.length ? ` (${saved.length})` : ''} <HelpTip term="savedPlans" />
          </h2>
          {saved.length >= 2 && <p className="block-hint">Tick up to {MAX_COMPARE} plans to compare them.</p>}
        </div>

        {saved.length === 0 ? (
          <p className="saved-empty">No saved plans yet. Save the plan above, or import a backup from your other device below.</p>
        ) : (
          <ul className="plan-list">
            {saved.map((rec) => (
              <PlanRow
                key={rec.id}
                rec={rec}
                outcome={summaries.get(rec.id)}
                isOpen={rec.id === plan.id}
                openChanged={rec.id === plan.id && status === 'changed'}
                picked={pickedIds.includes(rec.id)}
                pickDisabled={!pickedIds.includes(rec.id) && pickedIds.length >= MAX_COMPARE}
                showPick={saved.length >= 2}
                onPick={() => togglePick(rec.id)}
                onOpen={() => open(rec.plan)}
                onMore={() => setPopup({ kind: 'menu', rec })}
              />
            ))}
          </ul>
        )}
      </section>

      {pickedPlans.length > 0 && (
        <div className="compare-bar" role="region" aria-label="Compare">
          <span>{pickedPlans.length === 1 ? 'Tick 1 or 2 more to compare' : `${pickedPlans.length} plans ticked`}</span>
          <button type="button" className="btn btn-quiet" onClick={() => setPicked([])}>
            Clear
          </button>
          <button type="button" className="btn btn-primary" disabled={pickedPlans.length < 2} onClick={() => (setView('compare'), window.scrollTo({ top: 0 }))}>
            Compare
          </button>
        </div>
      )}

      <BackupSection
        saved={saved}
        currentStatus={status}
        onImported={(written) => {
          // If the import replaced the plan open in the Planner (and it had no unsaved edits), show the new version there too.
          const replaced = written.find((r) => r.id === plan.id)
          if (replaced && status === 'saved') setPlan(structuredClone(replaced.plan))
        }}
      />

      {popup && <Popups popup={popup} plan={plan} close={close} setPopup={setPopup} setPlan={setPlan} savedCopy={savedCopy} say={say} />}
    </div>
  )
}

const PencilIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" />
  </svg>
)

function StatusPill({ status }: { status: ReturnType<typeof saveStatus> }) {
  if (status === 'saved') return <span className="pill pill-good">✓ Saved</span>
  if (status === 'changed') return <span className="pill pill-warn">Unsaved changes</span>
  return <span className="pill">Not saved</span>
}

function PlanRow({
  rec,
  outcome,
  isOpen,
  openChanged,
  picked,
  pickDisabled,
  showPick,
  onPick,
  onOpen,
  onMore,
}: {
  rec: SavedPlanRecord
  outcome: PlanOutcome | undefined
  isOpen: boolean
  openChanged: boolean
  picked: boolean
  pickDisabled: boolean
  showPick: boolean
  onPick: () => void
  onOpen: () => void
  onMore: () => void
}) {
  const p = rec.plan
  const name = displayName(p)
  const phases = `${p.phases.length} ${p.phases.length === 1 ? 'phase' : 'phases'}`
  return (
    <li className={`plan-row${picked ? ' is-picked' : ''}`}>
      {showPick && (
        <label className="pick" title={pickDisabled ? `You can compare up to ${MAX_COMPARE} plans` : undefined}>
          <input type="checkbox" checked={picked} disabled={pickDisabled} onChange={onPick} aria-label={`Compare ${name}`} />
          <span className="pick-box" aria-hidden="true" />
        </label>
      )}
      <button type="button" className="plan-row-main" onClick={onOpen} aria-label={`Open ${name} in the Planner`}>
        <span className="plan-row-name">
          {name}
          {isOpen && <span className="pill pill-small">{openChanged ? 'In Planner, edited' : 'In Planner'}</span>}
        </span>
        <span className="plan-row-sum">
          {outcome?.ok
            ? `${money(outcome.result.finalBalance, p.currency)} by ${dateMonthYear(outcome.result.endDay - 1)} · ${phases}`
            : `Needs fixing in the Planner · ${phases}`}
        </span>
        <span className="plan-row-date">Saved {changedOn(rec.updatedAt)}</span>
      </button>
      <div className="plan-row-btns">
        <button type="button" className="btn btn-secondary btn-small plan-row-open" onClick={onOpen} tabIndex={-1} aria-hidden="true">
          Open
        </button>
        <button type="button" className="icon-btn more-btn" onClick={onMore} aria-label={`More for ${name}`}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
            <circle cx="5" cy="12" r="1.8" />
            <circle cx="12" cy="12" r="1.8" />
            <circle cx="19" cy="12" r="1.8" />
          </svg>
        </button>
      </div>
    </li>
  )
}

function Popups({
  popup,
  plan,
  close,
  setPopup,
  setPlan,
  savedCopy,
  say,
}: {
  popup: Popup
  plan: Plan
  close: () => void
  setPopup: (p: Popup | null) => void
  setPlan: (p: Plan) => void
  savedCopy: SavedPlanRecord | undefined
  say: (text: string) => void
}) {
  switch (popup.kind) {
    case 'menu': {
      const { rec } = popup
      return (
        <Sheet title={displayName(rec.plan)} onClose={close}>
          <div className="menu-list">
            <button type="button" className="menu-item" onClick={() => setPopup({ kind: 'rename', rec })}>
              <PencilIcon /> Rename
            </button>
            <button
              type="button"
              className="menu-item"
              onClick={async () => {
                close()
                const copy = await duplicatePlan(rec.id)
                if (copy) say(`Made a copy: “${copy.plan.name}”.`)
              }}
            >
              <CopyIcon /> Duplicate
            </button>
            <button
              type="button"
              className="menu-item"
              onClick={() => {
                close()
                exportPlans([rec], true).then(say, () => say('The file couldn’t be saved. Please try again.'))
              }}
            >
              <DownloadIcon /> Back up just this plan
            </button>
            <button type="button" className="menu-item is-danger" onClick={() => setPopup({ kind: 'delete', rec })}>
              <TrashIcon /> Delete
            </button>
          </div>
          <button type="button" className="btn btn-quiet" onClick={close}>
            Cancel
          </button>
        </Sheet>
      )
    }

    case 'rename':
      return <RenameSheet rec={popup.rec} plan={plan} setPlan={setPlan} close={close} />

    case 'delete': {
      const { rec } = popup
      return (
        <Sheet title={`Delete “${displayName(rec.plan)}”?`} onClose={close}>
          <p>This removes it from your saved plans on this device. It can’t be undone (unless it’s in a backup file).</p>
          {rec.id === plan.id && <p className="block-hint">It’s open in the Planner right now. It will stay there, but won’t be saved.</p>}
          <div className="saved-actions">
            <button
              type="button"
              className="btn btn-danger-solid"
              onClick={async () => {
                close()
                await deletePlan(rec.id)
                say(`Deleted “${displayName(rec.plan)}”.`)
              }}
            >
              Delete
            </button>
            <button type="button" className="btn btn-quiet" onClick={close} autoFocus>
              Cancel
            </button>
          </div>
        </Sheet>
      )
    }

    case 'unsaved':
      return (
        <Sheet title="Save your current plan first?" onClose={close}>
          <p>
            “{displayName(plan)}” in the Planner {savedCopy ? 'has changes that aren’t saved' : 'isn’t in your saved plans'}. If you don’t save it, it will be replaced.
          </p>
          <div className="menu-list">
            <button
              type="button"
              className="btn btn-primary"
              onClick={async () => {
                await savePlan(plan)
                close()
                popup.then()
              }}
            >
              Save it, then continue
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                close()
                popup.then()
              }}
            >
              Don’t save
            </button>
            <button type="button" className="btn btn-quiet" onClick={close}>
              Cancel
            </button>
          </div>
        </Sheet>
      )

    case 'revert':
      return (
        <Sheet title="Undo your changes?" onClose={close}>
          <p>“{displayName(plan)}” goes back to how it was when you last saved it. The changes since then will be lost.</p>
          <div className="saved-actions">
            <button
              type="button"
              className="btn btn-danger-solid"
              onClick={() => {
                if (savedCopy) setPlan(structuredClone(savedCopy.plan))
                close()
                say('Changes undone.')
              }}
            >
              Undo changes
            </button>
            <button type="button" className="btn btn-quiet" onClick={close} autoFocus>
              Keep them
            </button>
          </div>
        </Sheet>
      )
  }
}

function RenameSheet({ rec, plan, setPlan, close }: { rec: SavedPlanRecord; plan: Plan; setPlan: (p: Plan) => void; close: () => void }) {
  const [name, setName] = useState(rec.plan.name)
  const submit = async () => {
    const clean = name.trim()
    if (!clean) return
    await renamePlan(rec.id, clean)
    if (plan.id === rec.id) setPlan({ ...plan, name: clean })
    close()
  }
  return (
    <Sheet title="Rename plan" onClose={close}>
      <form
        className="rename-form"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <input className="input-text" aria-label="Plan name" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={80} />
        <div className="saved-actions">
          <button type="submit" className="btn btn-primary" disabled={!name.trim()}>
            Rename
          </button>
          <button type="button" className="btn btn-quiet" onClick={close}>
            Cancel
          </button>
        </div>
      </form>
    </Sheet>
  )
}

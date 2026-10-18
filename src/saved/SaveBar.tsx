import { useState } from 'react'
import type { Plan } from '../engine/types'
import type { SavedPlanRecord } from '../state/db'
import { savePlan } from '../state/plans'
import { saveStatus } from './status'
import './saved.css'

/** A slim line at the top of the Planner: is this plan in Saved, and a Save button if not. */
export function SaveBar({ plan, saved, onShowSaved }: { plan: Plan; saved: SavedPlanRecord[]; onShowSaved: () => void }) {
  const status = saveStatus(plan, saved)
  const [busy, setBusy] = useState(false)

  return (
    <div className={`save-bar is-${status}`}>
      {status === 'saved' ? (
        <button type="button" className="save-bar-link" onClick={onShowSaved}>
          ✓ Saved
        </button>
      ) : (
        <>
          <span className="save-bar-text">{status === 'new' ? 'Not in your saved plans yet' : 'Changed since you saved it'}</span>
          <button
            type="button"
            className="btn btn-primary btn-small"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              await savePlan(plan).finally(() => setBusy(false))
            }}
          >
            {status === 'new' ? 'Save' : 'Save changes'}
          </button>
        </>
      )}
    </div>
  )
}

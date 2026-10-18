// ⓘ button for the Inflation tab's own terms (same look as the Planner's).

import { useId } from 'react'
import { inflationWords, type InflationWord } from './words'

/** ⓘ button for the Inflation tab's own terms. */
export function Tip({ term }: { term: InflationWord }) {
  const id = useId()
  const { title, body } = inflationWords[term]
  return (
    <>
      <button type="button" className="info-btn" popoverTarget={id} aria-label={`What is “${title}”?`}>
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="8" cy="4.9" r="0.95" fill="currentColor" />
          <path d="M8 7.2v4.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      <div id={id} popover="auto" className="info-card" role="dialog" aria-label={title}>
        <h3>{title}</h3>
        <p>{body}</p>
        <button type="button" className="btn btn-quiet" popoverTarget={id} popoverTargetAction="hide">
          Got it
        </button>
      </div>
    </>
  )
}

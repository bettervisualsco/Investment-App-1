import { useId } from 'react'
import { glossary, type GlossaryKey } from './glossary'

/** A small ⓘ button that opens a short explanation card. Every tab's ⓘ uses this, so they all look and behave the same. */
export function InfoButton({ title, body }: { title: string; body: string }) {
  const id = useId()
  return (
    <>
      <button type="button" className="info-btn" popoverTarget={id} aria-label={`What is “${title}”?`}>
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="8" cy="4.9" r="0.95" fill="currentColor" />
          <path d="M8 7.2v4.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      {/* Spans (shown as blocks), so an ⓘ can sit inside a paragraph, label or heading without breaking the page structure. */}
      <span id={id} popover="auto" className="info-card" role="dialog" aria-label={title}>
        <span className="info-card-title">{title}</span>
        <span className="info-card-body">{body}</span>
        <button type="button" className="btn btn-quiet" popoverTarget={id} popoverTargetAction="hide">
          Got it
        </button>
      </span>
    </>
  )
}

/** ⓘ for a term in the shared glossary. */
export function InfoTip({ term }: { term: GlossaryKey }) {
  return <InfoButton {...glossary[term]} />
}

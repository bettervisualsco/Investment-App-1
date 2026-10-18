// Small building blocks for the Saved tab: a pop-up sheet and ⓘ help.

import { useEffect, useId, useRef, type ReactNode } from 'react'
import { savedWords, type SavedWord } from './words'

/** A card that slides up on iPhone (centred on Mac). Escape or tapping outside closes it. */
export function Sheet({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const id = useId()
  const box = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  })

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    const first = box.current?.querySelector<HTMLElement>('[autofocus], input, button')
    first?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      before?.focus?.()
    }
  }, [])

  return (
    <div className="sheet-backdrop" role="presentation" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} className={`sheet saved-sheet${wide ? ' is-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={id}>
        <h2 id={id}>{title}</h2>
        {children}
      </div>
    </div>
  )
}

/** ⓘ button for the Saved tab's own terms (same look as the Planner's). */
export function HelpTip({ term }: { term: SavedWord }) {
  const id = useId()
  const { title, body } = savedWords[term]
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

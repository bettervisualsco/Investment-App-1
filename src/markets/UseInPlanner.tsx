// "Use in Planner": puts the highlighted period's average yearly return into a phase of the
// current plan, chosen by the person.

import { useId, useState, type Dispatch, type SetStateAction } from 'react'
import { DEFAULT_MER } from '../engine/defaults'
import type { Phase, Plan, Varying } from '../engine/types'
import { dayText, rateText } from './format'
import { addBackFee, type PeriodStats } from './maths'

/**
 * Hook for stage 3 (Prediction mode, built at the same time): "use this history window" in a
 * phase. Stage 5 doesn't know stage 3's new phase fields, so it only says what was picked; the
 * app wires this up in App.tsx after both stages are merged (see notes/stage-5.md).
 */
export interface HistoryWindowRequest {
  phaseId: string
  /** The ETF whose history was highlighted, e.g. "VAS". */
  etfId: string
  /** First and last day highlighted ("YYYY-MM-DD"). */
  from: string
  to: string
  /** The same period as whole months ("YYYY-MM"), the way Prediction mode samples history. */
  fromMonth: string
  toMonth: string
  /** The person was looking at a US-listed ETF in Australian dollars. */
  inAud: boolean
}

function rateSummary(v: Varying): string {
  if (v.kind === 'fixed') return `${v.value}% a year`
  if (v.kind === 'ramp') return `${v.from}% → ${v.to}% a year`
  return `${v.from}%, then steps of ${v.stepBy}%`
}

export function UseInPlanner({
  plan,
  setPlan,
  etfId,
  etfName,
  merPct,
  usListed,
  stats,
  currencyNote,
  missingDistributions,
  onUseHistoryWindow,
  inAud,
  onClose,
}: {
  plan: Plan | null
  setPlan: Dispatch<SetStateAction<Plan | null>>
  etfId: string
  etfName: string
  merPct: number | null
  usListed: boolean
  stats: PeriodStats
  currencyNote: string
  missingDistributions: boolean
  /** Returns the confirmation message to show (it knows what really changed). */
  onUseHistoryWindow?: (req: HistoryWindowRequest) => string | void
  inAud: boolean
  onClose: () => void
}) {
  const titleId = useId()
  const phases = plan?.phases ?? []
  const [phaseId, setPhaseId] = useState<string>(phases[0]?.id ?? '')
  const [withFee, setWithFee] = useState(merPct !== null)
  const [done, setDone] = useState<string | null>(null)

  const net = stats.totalYearly
  const phase = phases.find((p) => p.id === phaseId)
  // The Planner's rates are before the fund's fee (the Fees switch takes it off), so add back the fee that phase
  // will actually be charged: the ETF's if it's being set too, otherwise the phase's own. Index returns have no fee.
  const appliedMer = merPct === null ? null : withFee ? merPct : phase?.investment?.kind === 'cash' ? 0 : (phase?.mer ?? DEFAULT_MER)
  const gross = appliedMer !== null ? addBackFee(net, appliedMer) : net
  // the Planner takes rates as % a year, to 2 decimal places
  const ratePct = Math.round(gross * 10000) / 100
  // A US-listed ETF shown in US$ gives a US$ rate; everything else here is in A$.
  const rateCurrency = usListed && !inAud ? 'USD' : 'AUD'
  const currencyMismatch = !!plan && plan.currency !== rateCurrency

  const apply = () => {
    if (!phase) return
    setPlan((p) =>
      p
        ? {
            ...p,
            phases: p.phases.map((ph): Phase =>
              ph.id === phaseId ? { ...ph, returnRate: { kind: 'fixed', value: ratePct }, ...(withFee && merPct !== null ? { mer: merPct, usListed } : {}) } : ph,
            ),
          }
        : p,
    )
    setDone(`“${phase.name}” now grows at ${ratePct}% a year${withFee && merPct !== null ? `, with ${etfId}’s ${merPct}% fee` : ''}.`)
  }

  const useWindow = () => {
    if (!phase || !onUseHistoryWindow) return
    const message = onUseHistoryWindow({ phaseId, etfId, from: stats.from, to: stats.to, fromMonth: stats.from.slice(0, 7), toMonth: stats.to.slice(0, 7), inAud })
    setDone(message || `“${phase.name}” will replay ${etfId}’s history from ${dayText(stats.from)} to ${dayText(stats.to)} in Prediction mode.`)
  }

  return (
    <div className="sheet-backdrop" role="presentation" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet mk-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId}>Use in Planner</h2>
        {done ? (
          <>
            <p className="mk-done">✓ {done}</p>
            <div className="mk-sheet-actions">
              <a className="btn btn-primary" href="#/planner">
                Open the Planner
              </a>
              <button type="button" className="btn btn-quiet" onClick={onClose}>
                Stay here
              </button>
            </div>
          </>
        ) : !plan || phases.length === 0 ? (
          <>
            <p>Your plan has no phases yet. Add one in the Planner first.</p>
            <button type="button" className="btn btn-quiet" onClick={onClose}>
              Close
            </button>
          </>
        ) : (
          <>
            <p>
              {etfName}, {dayText(stats.from)} to {dayText(stats.to)}: <strong>{rateText(net, 2)} a year</strong> total return{currencyNote}.
            </p>
            {merPct !== null && appliedMer !== null && (
              <p className="block-hint">
                Prices are already after {etfId}’s {merPct}% fee. The Planner’s rates are before fees (the Fees switch takes the fee off), so it gets {ratePct}%: this
                period’s rate with {withFee ? `${etfId}’s` : 'this phase’s'} {appliedMer}% fee added back. With Fees off, results come out a little higher than the
                fund itself returned.
              </p>
            )}
            {currencyMismatch && (
              <p className="warnings mk-note">
                This rate is in {rateCurrency === 'USD' ? 'US' : 'Australian'} dollars, but your plan is in {plan!.currency === 'USD' ? 'US' : 'Australian'} dollars.
                {rateCurrency === 'USD' ? ' Turn on the A$ view first to get the rate in Australian dollars.' : ''}
              </p>
            )}
            {missingDistributions && <p className="warnings mk-note">Part of this period has no distribution records, so the real total return was probably a bit higher.</p>}
            <fieldset className="mk-phases">
              <legend>Which phase?</legend>
              {phases.map((p, i) => (
                <label key={p.id} className={`mk-phase${p.id === phaseId ? ' is-on' : ''}`}>
                  <input type="radio" name="mk-phase" value={p.id} checked={p.id === phaseId} onChange={() => setPhaseId(p.id)} />
                  <span>
                    <strong>
                      {i + 1}. {p.name || 'Untitled phase'}
                    </strong>
                    <span>Now: {rateSummary(p.returnRate)}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            {merPct !== null && (
              <label className="mk-check">
                <input type="checkbox" checked={withFee} onChange={(e) => setWithFee(e.target.checked)} />
                Also set this phase’s fee to {etfId}’s {merPct}%{usListed ? ' (and mark it as listed in the US)' : ''}
              </label>
            )}
            <div className="mk-sheet-actions">
              <button type="button" className="btn btn-primary" onClick={apply} disabled={!phase}>
                Use {ratePct}% a year
              </button>
              <button type="button" className="btn btn-quiet" onClick={onClose}>
                Cancel
              </button>
            </div>
            {onUseHistoryWindow ? (
              <button type="button" className="btn btn-quiet mk-window-btn" onClick={useWindow} disabled={!phase}>
                Or replay this period’s history in Prediction mode
              </button>
            ) : (
              <p className="block-hint">Coming with Prediction mode: replay just this period’s history in a phase.</p>
            )}
            <p className="block-hint">Past returns are history, not a promise of future returns.</p>
          </>
        )}
      </div>
    </div>
  )
}

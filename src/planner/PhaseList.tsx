import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useId } from 'react'
import { InfoTip } from '../components/InfoTip'
import { ChevronIcon, CopyIcon, GripIcon, PlusIcon, TrashIcon } from '../components/Icons'
import { Field, Select } from '../components/inputs'
import type { PhaseSummary } from '../engine/manual'
import type { PlanProblem } from '../engine/validate'
import type { Currency, Phase } from '../engine/types'
import { dateLong, moneyExact } from '../lib/format'
import { newId } from '../lib/id'
import { blankPhase } from '../state/defaultPlan'
import { DurationInput, VaryingEditor } from './VaryingEditor'
import { frequencyOptions, phaseSentence } from './words'

interface Props {
  phases: Phase[]
  summaries: PhaseSummary[] | null
  problems: PlanProblem[]
  currency: Currency
  openId: string | null
  setOpenId: (id: string | null) => void
  onChange: (phases: Phase[]) => void
}

export function PhaseList({ phases, summaries, problems, currency, openId, setOpenId, onChange }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const from = phases.findIndex((p) => p.id === active.id)
    const to = phases.findIndex((p) => p.id === over.id)
    onChange(arrayMove(phases, from, to))
  }

  const update = (id: string, next: Phase) => onChange(phases.map((p) => (p.id === id ? next : p)))

  return (
    <section className="block" aria-labelledby="phases-title">
      <div className="block-head">
        <h2 id="phases-title">Your timeline</h2>
        <p className="block-hint">Phases run one after another. Drag the handle to reorder.</p>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={phases.map((p) => p.id)} strategy={verticalListSortingStrategy}>
          <ol className="phase-list">
            {phases.map((phase, i) => (
              <PhaseCard
                key={phase.id}
                index={i}
                phase={phase}
                summary={summaries?.find((s) => s.phaseId === phase.id) ?? null}
                problems={problems.filter((p) => p.where === phase.id)}
                currency={currency}
                open={openId === phase.id}
                onToggle={() => setOpenId(openId === phase.id ? null : phase.id)}
                onChange={(next) => update(phase.id, next)}
                onDuplicate={() => {
                  const copy = { ...structuredClone(phase), id: newId(), name: `${phase.name} (copy)` }
                  const next = [...phases]
                  next.splice(i + 1, 0, copy)
                  onChange(next)
                  setOpenId(copy.id)
                }}
                onDelete={
                  phases.length > 1
                    ? () => {
                        if (window.confirm(`Delete “${phase.name || 'this phase'}”?`)) onChange(phases.filter((p) => p.id !== phase.id))
                      }
                    : undefined
                }
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      <button
        type="button"
        className="btn btn-add"
        onClick={() => {
          const p = blankPhase(`Phase ${phases.length + 1}`)
          onChange([...phases, p])
          setOpenId(p.id)
        }}
      >
        <PlusIcon /> Add a phase
      </button>
    </section>
  )
}

function PhaseCard({
  index,
  phase,
  summary,
  problems,
  currency,
  open,
  onToggle,
  onChange,
  onDuplicate,
  onDelete,
}: {
  index: number
  phase: Phase
  summary: PhaseSummary | null
  problems: PlanProblem[]
  currency: Currency
  open: boolean
  onToggle: () => void
  onChange: (p: Phase) => void
  onDuplicate: () => void
  onDelete?: () => void
}) {
  const id = useId()
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: phase.id })
  const style = { transform: CSS.Translate.toString(transform), transition }

  return (
    <li ref={setNodeRef} style={style} id={`phase-${phase.id}`} className={`phase-card${isDragging ? ' is-dragging' : ''}${open ? ' is-open' : ''}`}>
      <div className="phase-head">
        <button type="button" className="grip" ref={setActivatorNodeRef} {...attributes} {...listeners} aria-label={`Move ${phase.name}`}>
          <GripIcon />
        </button>
        <button type="button" className="phase-toggle" aria-expanded={open} aria-controls={`${id}-body`} onClick={onToggle}>
          <span className="phase-num" aria-hidden="true">
            {index + 1}
          </span>
          <span className="phase-title">
            <span className="phase-name">{phase.name || 'Untitled phase'}</span>
            <span className="phase-sentence">{phaseSentence(phase, currency)}</span>
            {summary && (
              <span className="phase-dates">
                {dateLong(summary.start)} to {dateLong(summary.end - 1)}
              </span>
            )}
          </span>
          <ChevronIcon open={open} />
        </button>
      </div>

      {problems.length > 0 && (
        <ul className="problems">
          {problems.map((p, i) => (
            <li key={i}>{p.message}</li>
          ))}
        </ul>
      )}

      {open && (
        <div className="phase-body" id={`${id}-body`}>
          <Field label="Name" htmlFor={`${id}-name`}>
            <input id={`${id}-name`} className="input-text" value={phase.name} onChange={(e) => onChange({ ...phase, name: e.target.value })} />
          </Field>
          <Field label="How long">
            <DurationInput label="How long" value={phase.duration} onChange={(duration) => onChange({ ...phase, duration })} />
          </Field>

          <h3 className="sub-head">Deposits</h3>
          <Field label="How often" htmlFor={`${id}-freq`} info={<InfoTip term="depositTiming" />}>
            <Select id={`${id}-freq`} label="How often" value={phase.depositFrequency} options={frequencyOptions} onChange={(depositFrequency) => onChange({ ...phase, depositFrequency })} />
          </Field>
          {phase.depositFrequency !== 'none' && (
            <VaryingEditor name="Each deposit" isMoney currency={currency} value={phase.deposit} onChange={(deposit) => onChange({ ...phase, deposit })} />
          )}
          {summary && phase.depositFrequency !== 'none' && (
            <p className="phase-stat">
              {summary.depositCount.toLocaleString('en-AU')} {summary.depositCount === 1 ? 'deposit' : 'deposits'}, {moneyExact(summary.depositTotal, currency)} in
              total
            </p>
          )}

          <h3 className="sub-head">
            Growth <InfoTip term="returnRate" />
          </h3>
          <VaryingEditor name="Return rate" isMoney={false} currency={currency} value={phase.returnRate} onChange={(returnRate) => onChange({ ...phase, returnRate })} />

          <div className="phase-actions">
            <button type="button" className="btn btn-quiet" onClick={onDuplicate}>
              <CopyIcon /> Duplicate
            </button>
            {onDelete && (
              <button type="button" className="btn btn-quiet btn-danger" onClick={onDelete}>
                <TrashIcon /> Delete phase
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  )
}

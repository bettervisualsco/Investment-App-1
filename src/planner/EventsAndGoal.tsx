import { useId } from 'react'
import { InfoTip } from '../components/InfoTip'
import { PlusIcon, TrashIcon } from '../components/Icons'
import { Field, MoneyInput, Segmented } from '../components/inputs'
import type { Currency, Goal, OneOffEvent } from '../engine/types'
import type { PlanProblem } from '../engine/validate'
import { newId } from '../lib/id'

export function EventsSection({
  events,
  currency,
  defaultDate,
  problems,
  onChange,
}: {
  events: OneOffEvent[]
  currency: Currency
  defaultDate: string
  problems: PlanProblem[]
  onChange: (events: OneOffEvent[]) => void
}) {
  const update = (id: string, patch: Partial<OneOffEvent>) => onChange(events.map((e) => (e.id === id ? { ...e, ...patch } : e)))
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date))

  return (
    <section className="block" aria-labelledby="events-title">
      <div className="block-head">
        <h2 id="events-title">
          One-off events <InfoTip term="events" />
        </h2>
        <p className="block-hint">Money in or out on a single day.</p>
      </div>
      {sorted.length > 0 && (
        <ul className="event-list">
          {sorted.map((e) => (
            <EventRow
              key={e.id}
              event={e}
              currency={currency}
              problems={problems.filter((p) => p.where === e.id)}
              onChange={(patch) => update(e.id, patch)}
              onDelete={() => onChange(events.filter((x) => x.id !== e.id))}
            />
          ))}
        </ul>
      )}
      <button type="button" className="btn btn-add" onClick={() => onChange([...events, { id: newId(), name: '', date: defaultDate, amount: 50_000 }])}>
        <PlusIcon /> Add an event
      </button>
    </section>
  )
}

function EventRow({
  event,
  currency,
  problems,
  onChange,
  onDelete,
}: {
  event: OneOffEvent
  currency: Currency
  problems: PlanProblem[]
  onChange: (patch: Partial<OneOffEvent>) => void
  onDelete: () => void
}) {
  const id = useId()
  const isOut = event.amount < 0
  return (
    <li className="event-row">
      <input className="input-text event-name" aria-label="Event name" placeholder="What’s it for?" value={event.name} onChange={(e) => onChange({ name: e.target.value })} />
      <div className="event-controls">
        <Segmented
          label="Money in or out"
          value={isOut ? 'out' : 'in'}
          options={[
            { value: 'in', label: 'In' },
            { value: 'out', label: 'Out' },
          ]}
          onChange={(dir) => onChange({ amount: dir === 'out' ? -Math.abs(event.amount) : Math.abs(event.amount) })}
        />
        <MoneyInput label="Amount" currency={currency} value={Math.abs(event.amount)} onChange={(c) => onChange({ amount: isOut ? -c : c })} />
        <input id={`${id}-d`} type="date" className="input-text input-date" aria-label="Date" value={event.date} onChange={(e) => e.target.value && onChange({ date: e.target.value })} />
        <button type="button" className="icon-btn" aria-label={`Delete ${event.name || 'event'}`} onClick={onDelete}>
          <TrashIcon />
        </button>
      </div>
      {problems.length > 0 && <p className="problems">{problems[0].message}</p>}
    </li>
  )
}

export function GoalSection({
  goal,
  currency,
  defaultDate,
  onChange,
}: {
  goal: Goal | undefined
  currency: Currency
  defaultDate: string
  onChange: (goal: Goal | undefined) => void
}) {
  const id = useId()
  return (
    <section className="block" aria-labelledby="goal-title">
      <div className="block-head">
        <h2 id="goal-title">
          Goal <InfoTip term="goal" />
        </h2>
        <label className="switch">
          <input type="checkbox" checked={!!goal} onChange={(e) => onChange(e.target.checked ? { amount: 10_000_000, date: defaultDate } : undefined)} />
          <span className="switch-track" aria-hidden="true" />
          <span className="visually-hidden">Set a goal</span>
        </label>
      </div>
      {goal ? (
        <div className="goal-fields">
          <Field label="Amount" htmlFor={`${id}-a`}>
            <MoneyInput id={`${id}-a`} label="Goal amount" currency={currency} value={goal.amount} onChange={(amount) => onChange({ ...goal, amount })} />
          </Field>
          <Field label="By" htmlFor={`${id}-d`}>
            <input id={`${id}-d`} type="date" className="input-text input-date" value={goal.date} onChange={(e) => e.target.value && onChange({ ...goal, date: e.target.value })} />
          </Field>
        </div>
      ) : (
        <p className="block-hint">Turn on to set an amount you’d like to reach by a date.</p>
      )}
    </section>
  )
}

import { useState, type ReactNode } from 'react'
import { moneyInputText, parseMoney } from '../lib/format'
import type { Currency } from '../engine/types'

/** Money box: you type dollars, it stores cents. Only reports valid numbers. */
export function MoneyInput({
  value,
  onChange,
  currency = 'AUD',
  allowNegative = false,
  label,
  id,
}: {
  value: number
  onChange: (cents: number) => void
  currency?: Currency
  allowNegative?: boolean
  label: string
  id?: string
}) {
  // While typing, show exactly what was typed; otherwise show the saved value, neatly formatted.
  const [text, setText] = useState('')
  const [focused, setFocused] = useState(false)

  return (
    <span className="input-money">
      <span className="input-affix" aria-hidden="true">
        {currency === 'AUD' ? '$' : 'US$'}
      </span>
      <input
        id={id}
        aria-label={label}
        inputMode="decimal"
        autoComplete="off"
        value={focused ? text : moneyInputText(value)}
        onFocus={() => {
          setText(moneyInputText(value))
          setFocused(true)
        }}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          setText(e.target.value)
          const cents = parseMoney(e.target.value)
          if (cents !== null && (allowNegative || cents >= 0)) onChange(cents)
        }}
      />
    </span>
  )
}

/** Plain number box (counts, percentages). */
export function NumberInput({
  value,
  onChange,
  label,
  suffix,
  integer = false,
  min,
  id,
  width = 'md',
}: {
  value: number
  onChange: (n: number) => void
  label: string
  suffix?: string
  integer?: boolean
  min?: number
  id?: string
  width?: 'sm' | 'md'
}) {
  const [text, setText] = useState('')
  const [focused, setFocused] = useState(false)

  return (
    <span className={`input-number input-${width}`}>
      <input
        id={id}
        aria-label={label}
        inputMode={integer ? 'numeric' : 'decimal'}
        autoComplete="off"
        value={focused ? text : String(value)}
        onFocus={() => {
          setText(String(value))
          setFocused(true)
        }}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          setText(e.target.value)
          const n = Number(e.target.value.replace(/[,%\s]/g, ''))
          if (e.target.value.trim() === '' || !Number.isFinite(n)) return
          if (integer && !Number.isInteger(n)) return
          if (min !== undefined && n < min) return
          onChange(n)
        }}
      />
      {suffix && (
        <span className="input-affix" aria-hidden="true">
          {suffix}
        </span>
      )}
    </span>
  )
}

export interface SelectGroup<T extends string> {
  label: string
  options: { value: T; label: string }[]
}

/** Drop-down list. `groups` (optional) are shown after `options` under their own headings. */
export function Select<T extends string>({
  value,
  onChange,
  options,
  groups,
  label,
  id,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  groups?: SelectGroup<T>[]
  label: string
  id?: string
}) {
  return (
    <span className="input-select">
      <select id={id} aria-label={label} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        {groups?.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
        <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}

/** iOS-style segmented control. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode; disabled?: boolean }[]
  label: string
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={o.disabled}
          className={value === o.value ? 'is-on' : undefined}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Field({ label, htmlFor, info, children }: { label: string; htmlFor?: string; info?: ReactNode; children: ReactNode }) {
  return (
    <div className="field">
      <div className="field-label">
        <label htmlFor={htmlFor}>{label}</label>
        {info}
      </div>
      <div className="field-control">{children}</div>
    </div>
  )
}

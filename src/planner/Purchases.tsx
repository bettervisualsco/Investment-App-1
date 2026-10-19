// "What you paid" and "Roughly when you bought it", for one purchase or several.

import { useEffect, useMemo, useState } from 'react'
import { PlusIcon, TrashIcon } from '../components/Icons'
import { InfoTip } from '../components/InfoTip'
import { Field, MoneyInput } from '../components/inputs'
import { decodeDaily, readDataFile, useDataState, type DailyFile, type DailyRows } from '../data'
import type { Currency, HoldingDetails, Investment, Plan, Purchase } from '../engine/types'
import { money } from '../lib/format'
import { newId } from '../lib/id'
import { estimatePurchaseValues } from '../predict/purchases'
import { MonthYear } from './MonthYear'

/** The ETFs an investment is made of (to look up their prices). */
function etfsIn(inv: Investment | undefined): string[] {
  if (!inv) return []
  if (inv.kind === 'etf') return [inv.etf]
  if (inv.kind === 'mix') return inv.parts.map((p) => p.etf)
  return []
}

/** Daily prices for some ETFs, read from the copy on this device (reloads when new data arrives). */
function useDailyRows(ids: string[]): Map<string, DailyRows> {
  const { version } = useDataState()
  const key = ids.join(',')
  const [rows, setRows] = useState<Map<string, DailyRows>>(new Map())
  useEffect(() => {
    let cancelled = false
    const list = key ? key.split(',') : []
    Promise.all(list.map((id) => readDataFile<DailyFile>(`daily/${id}.json`))).then((files) => {
      if (cancelled) return
      const map = new Map<string, DailyRows>()
      files.forEach((f, i) => f && map.set(list[i], decodeDaily(f)))
      setRows(map)
    })
    return () => {
      cancelled = true
    }
  }, [key, version])
  return rows
}

const sameNumbers = (a: (number | undefined)[], b: (number | undefined)[]) => a.length === b.length && a.every((x, i) => x === b[i])

export function PurchasesEditor({
  id,
  plan,
  details,
  value,
  currency,
  onChange,
}: {
  id: string
  plan: Plan
  details: HoldingDetails
  /** Today's value of the holding, cents. */
  value: number
  currency: Currency
  onChange: (d: HoldingDetails) => void
}) {
  const list = details.purchases
  const several = !!list && list.length >= 2
  const inv = details.investment ?? plan.phases[0]?.investment
  const rows = useDailyRows(several ? etfsIn(inv) : [])

  // Each purchase's share of today's value, from price history (null: shared by what was paid).
  const estimates = useMemo(
    () => (several ? estimatePurchaseValues(inv, list!, value, (etf) => rows.get(etf)) : null),
    [several, inv, list, value, rows],
  )

  // Keep the estimates in the plan, so results, backups and Compare don't need the price files.
  useEffect(() => {
    if (!several) return
    const next = list!.map((_, i) => (estimates ? estimates[i] : undefined))
    if (!sameNumbers(next, list!.map((p) => p.value))) onChange({ ...details, purchases: list!.map((p, i) => ({ ...p, value: next[i] })) })
  }, [estimates, several, list, details, onChange])

  const setPurchases = (purchases: Purchase[]) => {
    if (purchases.length === 1) {
      // Back to a single purchase: plain "what you paid" and "when".
      const [only] = purchases
      const { purchases: _drop, ...rest } = details
      void _drop
      onChange({ ...rest, costBase: only.paid, boughtOn: only.boughtOn })
    } else onChange({ ...details, costBase: undefined, boughtOn: undefined, purchases })
  }

  const addPurchase = () => {
    const first: Purchase[] = list?.length ? list : [{ id: newId(), boughtOn: details.boughtOn ?? plan.startDate, paid: details.costBase ?? value }]
    setPurchases([...first, { id: newId(), boughtOn: plan.startDate, paid: 0 }])
  }

  if (!several) {
    return (
      <>
        <Field label="What you paid" htmlFor={`${id}-cost`} info={<InfoTip term="costBase" />}>
          <MoneyInput id={`${id}-cost`} label="What you paid, including brokerage" currency={currency} value={details.costBase ?? value} onChange={(costBase) => onChange({ ...details, costBase })} />
        </Field>
        <Field label="Roughly when you bought it" htmlFor={`${id}-month`} info={<InfoTip term="boughtWhen" />}>
          <MonthYear id={`${id}-month`} value={details.boughtOn ?? plan.startDate} startDate={plan.startDate} onChange={(boughtOn) => onChange({ ...details, boughtOn })} />
        </Field>
        <button type="button" className="btn btn-quiet purchase-add" onClick={addPurchase}>
          <PlusIcon /> Bought it in more than one go? Add another purchase
        </button>
      </>
    )
  }

  const totalPaid = list!.reduce((sum, p) => sum + Math.max(0, p.paid), 0)
  return (
    <div className="purchases">
      <div className="purchases-head">
        <span>Purchases</span> <InfoTip term="purchases" />
      </div>
      <ol className="purchase-list">
        {list!.map((p, i) => (
          <li key={p.id} className="purchase-row">
            <span className="purchase-num" aria-hidden="true">
              {i + 1}
            </span>
            <div className="purchase-fields">
              <Field label="Roughly when" htmlFor={`${id}-p${i}-month`}>
                <MonthYear
                  id={`${id}-p${i}-month`}
                  value={p.boughtOn}
                  startDate={plan.startDate}
                  onChange={(boughtOn) => setPurchases(list!.map((x) => (x.id === p.id ? { ...x, boughtOn } : x)))}
                />
              </Field>
              <Field label="What you paid" htmlFor={`${id}-p${i}-paid`}>
                <MoneyInput
                  id={`${id}-p${i}-paid`}
                  label={`Purchase ${i + 1}: what you paid, including brokerage`}
                  currency={currency}
                  value={p.paid}
                  onChange={(paid) => setPurchases(list!.map((x) => (x.id === p.id ? { ...x, paid } : x)))}
                />
              </Field>
              <p className="purchase-worth">
                {estimates ? `Worth about ${money(estimates[i], currency)} of today’s ${money(value, currency)}` : `Shares today’s value by what you paid: about ${money(totalPaid > 0 ? (value * Math.max(0, p.paid)) / totalPaid : value / list!.length, currency)}`}
              </p>
            </div>
            <button type="button" className="icon-btn" aria-label={`Delete purchase ${i + 1}`} onClick={() => setPurchases(list!.filter((x) => x.id !== p.id))}>
              <TrashIcon />
            </button>
          </li>
        ))}
      </ol>
      <div className="purchases-foot">
        <span>
          Paid in total: <strong>{money(totalPaid, currency)}</strong>
        </span>
        <button type="button" className="btn btn-quiet" onClick={addPurchase}>
          <PlusIcon /> Add a purchase
        </button>
      </div>
      <p className="block-hint">
        {estimates
          ? 'Today’s value is split using the app’s price history: an earlier purchase at a lower price bought more units, so it’s worth more of it now.'
          : inv && (inv.kind === 'etf' || inv.kind === 'mix')
            ? 'There’s no price history for one of these dates yet, so today’s value is shared in proportion to what you paid.'
            : 'Today’s value is shared in proportion to what you paid.'}
      </p>
    </div>
  )
}

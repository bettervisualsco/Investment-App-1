import { useEffect, useRef, useState } from 'react'
import type { Plan } from '../engine/types'
import { loadDraft, saveDraft } from './db'
import { examplePlan } from './defaultPlan'

/** The plan being edited. Loads from the device on start and saves every change (half a second after you stop typing). */
export function usePlan() {
  const [plan, setPlan] = useState<Plan | null>(null)
  const loaded = useRef(false)

  useEffect(() => {
    let cancelled = false
    loadDraft().then((saved) => {
      if (cancelled) return
      loaded.current = true
      setPlan(saved ?? examplePlan())
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!plan || !loaded.current) return
    const timer = setTimeout(() => saveDraft(plan), 500)
    return () => clearTimeout(timer)
  }, [plan])

  return [plan, setPlan] as const
}

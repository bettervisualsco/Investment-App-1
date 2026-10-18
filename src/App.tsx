import { useEffect, useState, type ReactNode } from 'react'
import { InflationIcon, MarketsIcon, PlannerIcon, SavedIcon, SettingsIcon } from './components/Icons'
import { ComingSoon, DisclaimerSheet, SettingsPage } from './pages/OtherPages'
import { MarketsPage } from './markets/MarketsPage'
import { PlannerPage } from './planner/PlannerPage'
import { SaveBar } from './saved/SaveBar'
import { SavedPage } from './saved/SavedPage'
import { useSavedPlans } from './state/plans'
import { usePlan } from './state/usePlan'
import { hasSeenDisclaimer, markDisclaimerSeen, useTheme } from './state/theme'

type Tab = 'planner' | 'markets' | 'inflation' | 'saved' | 'settings'

const tabs: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'planner', label: 'Planner', icon: <PlannerIcon /> },
  { id: 'markets', label: 'Markets', icon: <MarketsIcon /> },
  { id: 'inflation', label: 'Inflation', icon: <InflationIcon /> },
  { id: 'saved', label: 'Saved', icon: <SavedIcon /> },
  { id: 'settings', label: 'Settings', icon: <SettingsIcon /> },
]

function tabFromHash(): Tab {
  const h = window.location.hash.replace('#/', '').replace('#', '')
  return tabs.some((t) => t.id === h) ? (h as Tab) : 'planner'
}

export default function App() {
  const [tab, setTab] = useState<Tab>(tabFromHash)
  const [plan, setPlan] = usePlan()
  const savedPlans = useSavedPlans()
  const [theme, setTheme] = useTheme()
  const [showDisclaimer, setShowDisclaimer] = useState(() => !hasSeenDisclaimer())

  useEffect(() => {
    const onHash = () => setTab(tabFromHash())
    window.addEventListener('hashchange', onHash)
    window.addEventListener('popstate', onHash)
    return () => {
      window.removeEventListener('hashchange', onHash)
      window.removeEventListener('popstate', onHash)
    }
  }, [])

  const go = (t: Tab) => {
    window.history.pushState(null, '', `#/${t}`)
    setTab(t)
    window.scrollTo({ top: 0 })
  }

  return (
    <div className="app">
      <nav className="tabbar" aria-label="Sections">
        <div className="brand" aria-hidden="true">
          Planner
        </div>
        {tabs.map((t) => (
          <button key={t.id} type="button" className={`tab${tab === t.id ? ' is-on' : ''}`} aria-current={tab === t.id ? 'page' : undefined} onClick={() => go(t.id)}>
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      <main className="main">
        {tab === 'planner' &&
          (plan ? (
            <>
              {savedPlans && <SaveBar plan={plan} saved={savedPlans} onShowSaved={() => go('saved')} />}
              {/* A new key when a different plan is opened, so the Planner starts fresh for it. */}
              <PlannerPage key={plan.id} plan={plan} setPlan={setPlan} />
            </>
          ) : (
            <div className="loading">Loading your plan…</div>
          ))}
        {tab === 'markets' && <MarketsPage plan={plan} setPlan={setPlan} />}
        {tab === 'inflation' && <ComingSoon title="Inflation" stage={6} what="Australian and US inflation history, predictions and a purchasing power calculator." />}
        {tab === 'saved' && <SavedPage plan={plan} setPlan={setPlan} saved={savedPlans} openPlanner={() => go('planner')} />}
        {tab === 'settings' && <SettingsPage theme={theme} setTheme={setTheme} onShowSaved={() => go('saved')} />}
      </main>

      {showDisclaimer && (
        <DisclaimerSheet
          onClose={() => {
            markDisclaimerSeen()
            setShowDisclaimer(false)
          }}
        />
      )}
    </div>
  )
}

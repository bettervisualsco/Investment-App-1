import { useEffect, useState } from 'react'

export type ThemeChoice = 'auto' | 'light' | 'dark'
const KEY = 'theme'

function read(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'auto'
  } catch {
    return 'auto'
  }
}

export function useTheme() {
  const [theme, setTheme] = useState<ThemeChoice>(read)
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'auto') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
    try {
      localStorage.setItem(KEY, theme)
    } catch {
      // Not remembered, but still applied.
    }
  }, [theme])
  return [theme, setTheme] as const
}

export function hasSeenDisclaimer(): boolean {
  try {
    return localStorage.getItem('disclaimer-seen') === '1'
  } catch {
    return false
  }
}

export function markDisclaimerSeen() {
  try {
    localStorage.setItem('disclaimer-seen', '1')
  } catch {
    // Fine: it will show again next time.
  }
}

import * as React from 'react'

export type AppLanguage = 'tr' | 'en'

const LANGUAGE_KEY = 'mehmetipa.language'
const LANGUAGE_EVENT = 'mehmetipa:language-change'

/** The single language source used by every React screen. */
export function getAppLanguage(): AppLanguage {
  if (typeof window === 'undefined') return 'tr'
  try {
    return window.localStorage.getItem(LANGUAGE_KEY) === 'en' ? 'en' : 'tr'
  } catch {
    return 'tr'
  }
}

function subscribeToAppLanguage(onChange: () => void) {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(LANGUAGE_EVENT, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(LANGUAGE_EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}

/**
 * Subscribe React components to the same persisted language that drives the
 * DOM translation controller. This prevents screens from keeping stale locale
 * state after the user switches language.
 */
export function useAppLanguage(): AppLanguage {
  return React.useSyncExternalStore(subscribeToAppLanguage, getAppLanguage, () => 'tr')
}

"use client"

import { useEffect, useRef, useState } from "react"

/**
 * A drop-in replacement for useState that persists the value to localStorage so
 * it survives logout/login, page reloads, and navigation (anything that remounts
 * the component). Hydration is guarded so the persisted value is never clobbered
 * by the initial default before it has loaded.
 *
 * @param key            Unique localStorage key (e.g. "mcc.instruments.v1")
 * @param defaultValue   Value used when nothing is stored yet
 */
export function usePersistentState<T>(
  key: string,
  defaultValue: T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(defaultValue)
  const hydrated = useRef(false)

  // Load the persisted value once on mount.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(key)
      if (stored !== null) {
        setValue(JSON.parse(stored) as T)
      }
    } catch {
      // Ignore malformed/unavailable storage and fall back to the default.
    }
    hydrated.current = true
  }, [key])

  // Persist on every change, but only after the initial hydration so we don't
  // overwrite stored data with the default value on first render.
  useEffect(() => {
    if (!hydrated.current) return
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // Ignore quota/availability errors.
    }
  }, [key, value])

  return [value, setValue]
}

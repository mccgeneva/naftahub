"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/**
 * A drop-in replacement for useState that persists the value to localStorage.
 *
 * Isolation guarantee: the persisted value belongs to whatever `key` is passed.
 * Callers namespace the key per signed-in account (e.g. `"...::<userId>"`), so
 * when a DIFFERENT user signs in on the SAME device the key changes and this
 * hook immediately drops back to the default — a previous account's value can
 * never be read or written under the new key. That closes the cross-user leak
 * where logging out and back in as someone else exposed the first user's data.
 *
 * @param key            Unique, per-user localStorage key
 * @param defaultValue   Value used when nothing is stored yet
 */
export function usePersistentState<T>(
  key: string,
  defaultValue: T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  // Capture the default in a ref so an inline literal (e.g. `[]` / `{}`) that is
  // a new reference every render does not churn effects or reset logic.
  const defaultRef = useRef(defaultValue)

  // Bundle the value with the key it belongs to plus a hydrated flag, so state,
  // its owning key, and load status can never drift apart across a key switch.
  const [state, setState] = useState<{ key: string; value: T; hydrated: boolean }>({
    key,
    value: defaultRef.current,
    hydrated: false,
  })

  // Render-phase reset when the key changes (a different account signs in). This
  // synchronously reverts to the default BEFORE commit, so the previous key's
  // value is never visible under — or persisted to — the new key. Guarded by the
  // equality check so it runs once per key change (no render loop).
  if (state.key !== key) {
    setState({ key, value: defaultRef.current, hydrated: false })
  }

  // Hydrate the stored value for the current key (client only). Kept in an
  // effect (not render) to avoid SSR/hydration mismatches.
  useEffect(() => {
    let stored: T | null = null
    try {
      const raw = window.localStorage.getItem(key)
      if (raw !== null) stored = JSON.parse(raw) as T
    } catch {
      // Ignore malformed/unavailable storage and fall back to the default.
    }
    setState((prev) =>
      prev.key === key
        ? { key, value: stored !== null ? stored : defaultRef.current, hydrated: true }
        : prev,
    )
  }, [key])

  // Persist on change, but only once hydrated for the CURRENT key — so the brief
  // default-value window during a key switch is never written back.
  useEffect(() => {
    if (!state.hydrated || state.key !== key) return
    try {
      window.localStorage.setItem(key, JSON.stringify(state.value))
    } catch {
      // Ignore quota/availability errors.
    }
  }, [key, state])

  const setValue = useCallback<React.Dispatch<React.SetStateAction<T>>>((action) => {
    setState((prev) => {
      const next = typeof action === "function" ? (action as (p: T) => T)(prev.value) : action
      return { ...prev, value: next }
    })
  }, [])

  return [state.value, setValue]
}

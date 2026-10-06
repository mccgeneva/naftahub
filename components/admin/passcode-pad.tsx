"use client"

import { useEffect, useRef } from "react"
import { Delete } from "lucide-react"
import { cn } from "@/lib/utils"

interface PasscodePadProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  length?: number
  disabled?: boolean
  label?: string
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"]

export function PasscodePad({
  value,
  onChange,
  onSubmit,
  length = 6,
  disabled = false,
  label = "Administrator Passcode",
}: PasscodePadProps) {
  // Rapid taps can land before React re-renders, so each tap must build on the
  // latest typed value rather than the value captured by the last render.
  const valueRef = useRef(value)
  useEffect(() => {
    valueRef.current = value
  }, [value])

  const press = (digit: string) => {
    if (disabled || valueRef.current.length >= length) return
    const next = valueRef.current + digit
    valueRef.current = next
    onChange(next)
  }
  const backspace = () => {
    if (disabled) return
    const next = valueRef.current.slice(0, -1)
    valueRef.current = next
    onChange(next)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (disabled) return
      if (/^\d$/.test(e.key)) {
        press(e.key)
      } else if (e.key === "Backspace") {
        backspace()
      } else if (e.key === "Enter") {
        onSubmit()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  return (
    <div className="flex flex-col items-center gap-6">
      <div
        className="flex items-center gap-3"
        role="status"
        aria-label={`${label}: ${value.length} of ${length} digits entered`}
      >
        {Array.from({ length }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-3.5 w-3.5 rounded-full border-2 border-primary transition-colors",
              i < value.length ? "bg-primary" : "bg-transparent",
            )}
          />
        ))}
      </div>

      <div className="grid w-full max-w-xs grid-cols-3 gap-3">
        {KEYS.map((k) => (
          <PadKey key={k} onClick={() => press(k)} disabled={disabled} aria-label={k}>
            {k}
          </PadKey>
        ))}
        <span aria-hidden="true" />
        <PadKey onClick={() => press("0")} disabled={disabled} aria-label="0">
          0
        </PadKey>
        <PadKey
          onClick={backspace}
          disabled={disabled || value.length === 0}
          aria-label="Delete last digit"
          variant="ghost"
        >
          <Delete className="h-6 w-6" />
        </PadKey>
      </div>
    </div>
  )
}

function PadKey({
  children,
  variant = "solid",
  className,
  onClick,
  disabled,
  ...props
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> & {
  variant?: "solid" | "ghost"
  onClick: () => void
}) {
  // iOS Safari swallows or delays `click` on quick consecutive taps (treated as a
  // double-tap), so register each press on pointer down. A keyboard-activated
  // click (detail 0) still works for accessibility.
  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={(e) => {
        if (disabled) return
        e.preventDefault()
        onClick()
      }}
      onClick={(e) => {
        if (e.detail === 0) onClick()
      }}
      className={cn(
        "flex h-16 select-none items-center justify-center rounded-2xl text-2xl font-medium tabular-nums transition-colors active:scale-95 disabled:opacity-40 touch-manipulation",
        variant === "solid"
          ? "bg-secondary text-foreground hover:bg-secondary/80 active:bg-primary active:text-primary-foreground"
          : "text-muted-foreground hover:bg-secondary/60",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

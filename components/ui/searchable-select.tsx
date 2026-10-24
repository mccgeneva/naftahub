"use client"

import { Children, isValidElement, useMemo, useRef, useState, type ReactNode } from "react"
import { Check, ChevronDown, Search, X } from "lucide-react"
import { cn } from "@/lib/utils"

interface Option {
  value: string
  label: string
}

function textOf(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return ""
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(textOf).join("")
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children)
  return ""
}

function collectOptions(children: ReactNode, out: Option[] = []): Option[] {
  Children.toArray(children).forEach((child) => {
    if (!isValidElement<{ value?: unknown; children?: ReactNode }>(child)) return
    const { value, children: inner } = child.props
    if (typeof value === "string") {
      out.push({ value, label: textOf(inner).replace(/\s+/g, " ").trim() || value })
    } else if (inner) {
      collectOptions(inner, out)
    }
  })
  return out
}

interface SearchableSelectProps {
  value?: string
  onValueChange?: (value: string) => void
  placeholder?: string
  disabled?: boolean
  id?: string
  className?: string
  children?: ReactNode
}

/**
 * Drop-in replacement for a long <Select> of customers: accepts the same
 * <SelectItem value=…> children and renders an inline type-to-filter list.
 * Inline (not a portal) so the iOS keyboard opening can't close it.
 */
export function SearchableSelect({
  value,
  onValueChange,
  placeholder = "Select a client",
  disabled,
  id,
  className,
  children,
}: SearchableSelectProps) {
  const options = useMemo(() => collectOptions(children), [children])
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const selected = options.find((o) => o.value === value)

  const filtered = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (!terms.length) return options
    return options.filter((o) => {
      const hay = o.label.toLowerCase()
      return terms.every((t) => hay.includes(t))
    })
  }, [options, query])

  const choose = (v: string) => {
    onValueChange?.(v)
    setQuery("")
    setOpen(false)
    inputRef.current?.blur()
  }

  return (
    <div className={cn("flex w-full flex-col gap-1", className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          ref={inputRef}
          id={id}
          type="text"
          disabled={disabled}
          value={open ? query : (selected?.label ?? "")}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => {
            setQuery("")
            setOpen(true)
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false)
            if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229 && filtered[0]) {
              e.preventDefault()
              choose(filtered[0].value)
            }
          }}
          placeholder={selected && !open ? selected.label : `${placeholder} — type to search`}
          role="combobox"
          aria-expanded={open}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          data-1p-ignore
          data-lpignore="true"
          className="h-11 w-full rounded-md border border-input bg-transparent pl-9 pr-10 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50"
        />
        {!disabled && (query || (value && open)) ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery("")
              inputRef.current?.focus()
            }}
            className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        )}
      </div>

      {open && !disabled && (
        <div className="overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md">
          <ul role="listbox" className="max-h-72 overflow-y-auto overscroll-contain py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-sm text-muted-foreground">
                {options.length === 0 ? "No accounts available" : <>No match for &ldquo;{query}&rdquo;</>}
              </li>
            ) : (
              filtered.map((o) => (
                <li key={o.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={o.value === value}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(o.value)}
                    className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm leading-snug hover:bg-accent hover:text-accent-foreground"
                  >
                    <span className="flex-1 text-pretty">{o.label}</span>
                    {o.value === value && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
                  </button>
                </li>
              ))
            )}
          </ul>
          <div className="flex items-center justify-between border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
            <span>
              {filtered.length} of {options.length}
            </span>
            <button type="button" onClick={() => setOpen(false)} className="min-h-8 px-2 font-medium text-foreground">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

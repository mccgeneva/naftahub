"use client"

import { useState } from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { COUNTRIES, countryFlag, getCountryByCode, getCountryByName } from "@/lib/countries"

type CountryComboboxProps = {
  /**
   * Selected value. When `valueMode` is "code" (default) this is the ISO
   * 3166-1 alpha-2 code; when "name" it is the (case-insensitive) country name.
   */
  value?: string
  onChange: (value: string) => void
  placeholder?: string
  id?: string
  className?: string
  triggerClassName?: string
  /** Optional className applied to the popover content (dropdown panel). */
  contentClassName?: string
  /**
   * Controls the format of `value` and the argument passed to `onChange`.
   * - "code": ISO 3166-1 alpha-2 code (e.g. "CH")
   * - "name": lowercased country name (e.g. "switzerland") — used by legacy
   *   forms that persist country names.
   */
  valueMode?: "code" | "name"
}

export function CountryCombobox({
  value,
  onChange,
  placeholder = "Select country",
  id,
  triggerClassName,
  contentClassName,
  valueMode = "code",
}: CountryComboboxProps) {
  const [open, setOpen] = useState(false)
  const selected = value
    ? valueMode === "name"
      ? getCountryByName(value)
      : getCountryByCode(value)
    : undefined

  const emit = (code: string, name: string) =>
    onChange(valueMode === "name" ? name : code)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between font-normal",
            !selected && "text-muted-foreground",
            triggerClassName,
          )}
        >
          {selected ? (
            <span className="flex items-center gap-2 truncate">
              <span aria-hidden="true">{countryFlag(selected.code)}</span>
              <span className="truncate">{selected.name}</span>
            </span>
          ) : (
            placeholder
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn("w-[var(--radix-popover-trigger-width)] p-0", contentClassName)}
        align="start"
      >
        <Command>
          <CommandInput placeholder="Search countries..." />
          <CommandList>
            <CommandEmpty>No country found.</CommandEmpty>
            <CommandGroup>
              {COUNTRIES.map((country) => (
                <CommandItem
                  key={country.code}
                  // Include the code so search also matches ISO codes (e.g. "CH").
                  value={`${country.name} ${country.code}`}
                  onSelect={() => {
                    emit(country.code, country.name)
                    setOpen(false)
                  }}
                  className="gap-2"
                >
                  <span aria-hidden="true">{countryFlag(country.code)}</span>
                  <span className="truncate">{country.name}</span>
                  <Check
                    className={cn(
                      "ml-auto h-4 w-4",
                      selected?.code === country.code ? "opacity-100" : "opacity-0",
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

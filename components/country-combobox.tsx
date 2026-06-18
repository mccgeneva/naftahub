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
import { COUNTRIES, countryFlag, getCountryByCode } from "@/lib/countries"

type CountryComboboxProps = {
  /** Selected ISO 3166-1 alpha-2 country code. */
  value?: string
  onChange: (code: string) => void
  placeholder?: string
  id?: string
  className?: string
  triggerClassName?: string
}

export function CountryCombobox({
  value,
  onChange,
  placeholder = "Select country",
  id,
  triggerClassName,
}: CountryComboboxProps) {
  const [open, setOpen] = useState(false)
  const selected = value ? getCountryByCode(value) : undefined

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
            "w-full justify-between bg-zinc-800 border-zinc-700 font-normal hover:bg-zinc-800",
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
        className="w-[var(--radix-popover-trigger-width)] p-0 bg-zinc-900 border-zinc-800"
        align="start"
      >
        <Command className="bg-zinc-900">
          <CommandInput placeholder="Search countries..." className="text-foreground" />
          <CommandList>
            <CommandEmpty>No country found.</CommandEmpty>
            <CommandGroup>
              {COUNTRIES.map((country) => (
                <CommandItem
                  key={country.code}
                  // Include the code so search also matches ISO codes (e.g. "CH").
                  value={`${country.name} ${country.code}`}
                  onSelect={() => {
                    onChange(country.code)
                    setOpen(false)
                  }}
                  className="gap-2 text-foreground aria-selected:bg-zinc-800"
                >
                  <span aria-hidden="true">{countryFlag(country.code)}</span>
                  <span className="truncate">{country.name}</span>
                  <Check
                    className={cn(
                      "ml-auto h-4 w-4",
                      value === country.code ? "opacity-100" : "opacity-0",
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

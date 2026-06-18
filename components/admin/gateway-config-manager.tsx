"use client"

import { useEffect, useMemo, useState } from "react"
import { SlidersHorizontal, Loader2, Landmark, Layers, Globe2, Coins } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { ADMIN_PASSCODE } from "@/lib/admin-config"
import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_KEYS,
  GATEWAY_CURRENCIES,
  type GatewayAccountType,
} from "@/lib/gateway-catalog"
import {
  getGatewayConfigAdmin,
  setGatewayFeatureAdmin,
  type GatewayConfig,
} from "@/app/actions/gateway-config"

const typeIcons: Record<GatewayAccountType, typeof Landmark> = {
  virtual_iban: Landmark,
  collection: Layers,
  multicurrency: Globe2,
}

export function GatewayConfigManager() {
  const [config, setConfig] = useState<GatewayConfig>({
    disabledAccountTypes: [],
    disabledCurrencies: [],
  })
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    getGatewayConfigAdmin(ADMIN_PASSCODE)
      .then((res) => {
        if (!active) return
        if (!res.ok) {
          toast.error(res.error)
          return
        }
        setConfig(res.config)
      })
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  const disabledTypes = useMemo(
    () => new Set(config.disabledAccountTypes),
    [config.disabledAccountTypes],
  )
  const disabledCurrencies = useMemo(
    () => new Set(config.disabledCurrencies),
    [config.disabledCurrencies],
  )

  const enabledTypeCount = ACCOUNT_TYPE_KEYS.length - disabledTypes.size
  const enabledCurrencyCount = GATEWAY_CURRENCIES.length - disabledCurrencies.size

  const toggle = async (
    kind: "account_type" | "currency",
    key: string,
    enabled: boolean,
  ) => {
    const savingId = `${kind}::${key}`
    setSavingKey(savingId)
    const res = await setGatewayFeatureAdmin(ADMIN_PASSCODE, kind, key, enabled)
    setSavingKey(null)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    setConfig(res.config)
    const label = kind === "account_type" ? ACCOUNT_TYPES[key as GatewayAccountType].label : key
    toast.success(`${label} ${enabled ? "enabled" : "disabled"}`, {
      description: enabled
        ? "Clients can now request it."
        : "Hidden from new account requests.",
    })
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-lg font-semibold">
          <SlidersHorizontal className="h-5 w-5 text-primary" />
          Account Types &amp; Currencies
          <span className="ml-auto flex flex-wrap items-center gap-2 text-xs font-normal text-muted-foreground">
            <Badge variant="secondary" className="bg-secondary text-foreground">
              {enabledTypeCount}/{ACCOUNT_TYPE_KEYS.length} types
            </Badge>
            <Badge variant="secondary" className="bg-secondary text-foreground">
              {enabledCurrencyCount}/{GATEWAY_CURRENCIES.length} currencies
            </Badge>
          </span>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Control which account types and currencies clients can request platform-wide. Disabled
          options are hidden from the request form. At least one of each must stay enabled.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading gateway configuration…
          </div>
        ) : (
          <>
            {/* Account types */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">Account Types</h3>
              </div>
              <div className="grid gap-2">
                {ACCOUNT_TYPE_KEYS.map((key) => {
                  const enabled = !disabledTypes.has(key)
                  const Icon = typeIcons[key]
                  const isSaving = savingKey === `account_type::${key}`
                  return (
                    <div
                      key={key}
                      className={cn(
                        "flex items-center gap-3 rounded-lg border border-border bg-secondary/20 p-3",
                        !enabled && "opacity-70",
                      )}
                    >
                      <div
                        className={cn(
                          "shrink-0 rounded-md p-2",
                          enabled ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground",
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">
                          {ACCOUNT_TYPES[key].label}
                        </p>
                        <p className="text-xs text-muted-foreground text-pretty">
                          {ACCOUNT_TYPES[key].blurb}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {isSaving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                        <Switch
                          checked={enabled}
                          disabled={isSaving}
                          onCheckedChange={(checked) => toggle("account_type", key, checked)}
                          aria-label={`${enabled ? "Disable" : "Enable"} ${ACCOUNT_TYPES[key].label}`}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Currencies */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Coins className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">Currencies</h3>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {GATEWAY_CURRENCIES.map((currency) => {
                  const enabled = !disabledCurrencies.has(currency)
                  const isSaving = savingKey === `currency::${currency}`
                  return (
                    <label
                      key={currency}
                      className={cn(
                        "flex items-center justify-between gap-2 rounded-md border border-border bg-secondary/20 px-3 py-2",
                        !enabled && "opacity-70",
                      )}
                    >
                      <span className="font-mono text-sm font-semibold text-foreground">
                        {currency}
                      </span>
                      <span className="flex items-center gap-2">
                        {isSaving && (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                        )}
                        <Switch
                          checked={enabled}
                          disabled={isSaving}
                          onCheckedChange={(checked) => toggle("currency", currency, checked)}
                          aria-label={`${enabled ? "Disable" : "Enable"} ${currency}`}
                        />
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

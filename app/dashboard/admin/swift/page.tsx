"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Lock, ShieldCheck, ArrowLeft } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ADMIN_PASSCODE, ADMIN_SESSION_KEY } from "@/lib/admin-config"
import { AdminSwiftInspector } from "@/components/dashboard/admin-swift-inspector"

export default function AdminSwiftPage() {
  const [unlocked, setUnlocked] = useState(false)
  const [passcode, setPasscode] = useState("")
  const [gateError, setGateError] = useState<string | null>(null)

  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(ADMIN_SESSION_KEY) === "true") {
        setUnlocked(true)
      }
    } catch {
      // ignore
    }
  }, [])

  const handleUnlock = () => {
    if (passcode.trim() === ADMIN_PASSCODE) {
      setUnlocked(true)
      setGateError(null)
      setPasscode("")
      try {
        window.sessionStorage.setItem(ADMIN_SESSION_KEY, "true")
      } catch {
        // ignore
      }
    } else {
      setGateError("Incorrect administrator passcode. Please try again.")
    }
  }

  if (!unlocked) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center justify-center py-16">
        <Card className="w-full border-border bg-card">
          <CardHeader className="items-center text-center">
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Lock className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-xl font-semibold">SWIFT Message Inspector</CardTitle>
            <p className="text-pretty text-sm text-muted-foreground">
              This area is restricted. Enter the Administrator passcode to parse, validate, ingest, and
              generate SWIFT MT messages.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="swift-passcode">Administrator Passcode</Label>
              <Input
                id="swift-passcode"
                type="password"
                value={passcode}
                onChange={(e) => {
                  setPasscode(e.target.value)
                  setGateError(null)
                }}
                onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
                placeholder="Enter passcode"
                autoComplete="off"
              />
              {gateError && (
                <p className="text-sm text-destructive" role="alert">
                  {gateError}
                </p>
              )}
            </div>
            <Button className="w-full" onClick={handleUnlock}>
              <ShieldCheck className="mr-2 h-4 w-4" />
              Unlock Inspector
            </Button>
            <Button asChild variant="ghost" className="w-full">
              <Link href="/dashboard/admin">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Administrator Area
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return <AdminSwiftInspector />
}

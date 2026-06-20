"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PointerEventsGuard } from "@/components/pointer-events-guard"
import { toast } from "sonner"

export default function FreezeTest() {
  const [open, setOpen] = useState(false)
  const [cur, setCur] = useState("EUR")
  const [, setChurn] = useState(0)
  return (
    <div className="p-8 space-y-4">
      <PointerEventsGuard />
      <h1 className="text-xl font-bold">Freeze Test</h1>
      <nav className="flex gap-4">
        <Link href="/freeze-test?x=1" id="navlink" className="underline text-blue-600">
          Nav link (click after submit)
        </Link>
        <Link href="/login" className="underline text-blue-600">
          Go to login
        </Link>
      </nav>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button id="openbtn">Open payment dialog</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request New Payment</DialogTitle>
            <DialogDescription>Pick a currency and submit.</DialogDescription>
          </DialogHeader>
          <Select value={cur} onValueChange={setCur}>
            <SelectTrigger id="curtrigger">
              <SelectValue placeholder="EUR" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="EUR">EUR</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
              <SelectItem value="GBP">GBP</SelectItem>
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button
              id="submitbtn"
              onClick={() => {
                // Mirror the payments page submit handler exactly: a toast, a
                // burst of state updates (resetForm + provider churn), then a
                // programmatic dialog close — all in the same tick.
                toast.success("Payment submitted for approval", {
                  description: "Pending Administrator approval.",
                })
                setCur("EUR")
                for (let i = 0; i < 8; i++) setChurn((n) => n + 1)
                setOpen(false)
              }}
            >
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div id="bodype" className="text-sm text-gray-500">
        body pointer-events probe
      </div>
    </div>
  )
}

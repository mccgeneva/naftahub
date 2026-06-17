"use client"

import { useState } from "react"
import { LifeBuoy, Mail, Phone, MessageSquare, Clock, Send, ChevronDown } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { useActivityLog } from "@/components/activity-tracker"
import { useCurrentUser } from "@/lib/use-current-user"

const channels = [
  { icon: Mail, label: "Email", value: "admin@mccgva.ch", note: "Replies within 24 hours" },
  { icon: Phone, label: "Phone", value: "+41 22 000 0000", note: "Mon–Fri, 9:00–18:00 CET" },
  { icon: MessageSquare, label: "Live Chat", value: "Available in-app", note: "Mon–Fri, 9:00–18:00 CET" },
]

const faqs = [
  {
    q: "How do I add a new bank account?",
    a: "Go to Accounts in the sidebar and select Add Account. You will need the bank name, IBAN, and SWIFT/BIC code.",
  },
  {
    q: "Why is my balance showing zero?",
    a: "Your platform is newly activated. Balances update automatically once your first incoming transfer or instrument settles.",
  },
  {
    q: "How are notifications generated?",
    a: "Notifications appear automatically for payments, instrument trades, and rate alerts. New accounts start with a clean inbox.",
  },
  {
    q: "How do I update my company or KYC information?",
    a: "Visit the Profile page to review your details. To request a change, contact support with supporting documentation.",
  },
]

export default function SupportPage() {
  const [submitted, setSubmitted] = useState(false)
  const logActivity = useActivityLog()
  const user = useCurrentUser()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const formEl = e.target as HTMLFormElement
    const subject = (formEl.elements.namedItem("subject") as HTMLInputElement)?.value || ""
    const message = (formEl.elements.namedItem("message") as HTMLTextAreaElement)?.value || ""
    logActivity({
      action: `Submitted support request: ${subject || "(no subject)"}`,
      category: "Support",
      details: {
        summary: `Client submitted a support request with subject "${subject || "(no subject)"}".`,
        subject: subject || "(no subject)",
        message: message || "(empty)",
        submittedAt: new Date().toLocaleString("en-GB"),
      },
    })
    setSubmitted(true)
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Support</h1>
        <p className="text-sm text-muted-foreground">
          Get help with your account, transactions, and instruments
        </p>
      </div>

      {/* Contact channels */}
      <div className="grid gap-4 sm:grid-cols-3">
        {channels.map((c) => (
          <Card key={c.label}>
            <CardContent className="pt-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary mb-3">
                <c.icon className="h-5 w-5 text-primary" />
              </div>
              <p className="text-sm font-semibold text-foreground">{c.label}</p>
              <p className="text-sm text-foreground break-words">{c.value}</p>
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <Clock className="h-3 w-3" /> {c.note}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Contact form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <LifeBuoy className="h-4 w-4" /> Contact Support
            </CardTitle>
            <CardDescription>Send us a message and we&apos;ll get back to you</CardDescription>
          </CardHeader>
          <CardContent>
            {submitted ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary mb-3">
                  <Send className="h-5 w-5 text-primary" />
                </div>
                <p className="text-sm font-medium text-foreground">Message sent</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Our team will respond to {user.supportEmail} shortly.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="subject">Subject</Label>
                  <Input id="subject" placeholder="How can we help?" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="message">Message</Label>
                  <Textarea id="message" placeholder="Describe your issue or question..." rows={5} required />
                </div>
                <Button type="submit" className="w-full gap-2">
                  <Send className="h-4 w-4" /> Send Message
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        {/* FAQ */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Frequently Asked Questions</CardTitle>
            <CardDescription>Quick answers to common questions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {faqs.map((faq) => (
              <Collapsible key={faq.q} className="rounded-lg border border-border">
                <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 p-3 text-left text-sm font-medium text-foreground [&[data-state=open]>svg]:rotate-180">
                  {faq.q}
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform" />
                </CollapsibleTrigger>
                <CollapsibleContent className="px-3 pb-3 text-sm text-muted-foreground">
                  {faq.a}
                </CollapsibleContent>
              </Collapsible>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

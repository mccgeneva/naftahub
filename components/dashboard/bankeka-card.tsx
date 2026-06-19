"use client"

import Link from "next/link"
import useSWR from "swr"
import { MessageSquareText, ShieldCheck, ChevronRight, Check } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { listConversations } from "@/app/actions/bankeka"

function relativeTime(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return "now"
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

/**
 * Dashboard Overview widget: surfaces the Bankeka messaging status and unread
 * count for the signed-in client, with a peek at the most recent conversations.
 */
export function BankekaCard() {
  const { data: conversations = [] } = useSWR("bankeka-overview", () => listConversations(), {
    refreshInterval: 8000,
    revalidateOnFocus: true,
  })

  const totalUnread = conversations.reduce((sum, c) => sum + c.unread, 0)
  const recent = conversations.slice(0, 3)

  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <MessageSquareText className="h-4 w-4 text-primary" />
          </span>
          Bankeka Messenger
        </CardTitle>
        {totalUnread > 0 ? (
          <Badge className="bg-primary text-primary-foreground">{totalUnread} new</Badge>
        ) : (
          <Badge variant="secondary" className="gap-1 text-[10px]">
            <ShieldCheck className="h-3 w-3 text-success" />
            Secure
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {recent.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 py-4 text-center">
            <Check className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground text-pretty">
              No messages yet. Your private conversations will appear here.
            </p>
          </div>
        ) : (
          <ul className="space-y-1">
            {recent.map((c) => (
              <li key={c.participant.id}>
                <Link
                  href="/dashboard/bankeka"
                  className="flex items-center gap-3 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-secondary"
                >
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback
                      className={cn(
                        "text-[10px]",
                        c.participant.isAdmin
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-foreground",
                      )}
                    >
                      {c.participant.isAdmin ? <ShieldCheck className="h-4 w-4" /> : c.participant.initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-foreground">{c.participant.name}</p>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {relativeTime(c.lastMessageAt)}
                      </span>
                    </div>
                    <p
                      className={cn(
                        "truncate text-xs",
                        c.unread > 0 ? "font-medium text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {c.lastOutgoing ? "You: " : ""}
                      {c.lastMessage}
                    </p>
                  </div>
                  {c.unread > 0 && (
                    <Badge className="h-5 min-w-5 shrink-0 justify-center rounded-full px-1.5 text-[10px]">
                      {c.unread}
                    </Badge>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Button asChild variant="outline" size="sm" className="w-full">
          <Link href="/dashboard/bankeka">
            Open Messenger
            <ChevronRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}

"use client"

import Link from "next/link"
import useSWR from "swr"
import { MessageSquareText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { getMyUnreadCount } from "@/app/actions/bankeka"

/**
 * Header entry point for Bankeka. Polls the signed-in user's unread count every
 * few seconds so the badge stays current without a page refresh.
 */
export function BankekaHeaderButton() {
  const { data: unread = 0 } = useSWR("bankeka-header-unread", () => getMyUnreadCount(), {
    refreshInterval: 5000,
    revalidateOnFocus: true,
  })

  return (
    <Button asChild variant="ghost" size="icon" className="relative">
      <Link href="/dashboard/bankeka" aria-label={`Bankeka Messenger${unread > 0 ? `, ${unread} unread` : ""}`}>
        <MessageSquareText className="h-5 w-5" />
        {unread > 0 && (
          <Badge className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full p-0 px-1 text-[10px] bg-primary text-primary-foreground">
            {unread > 99 ? "99+" : unread}
          </Badge>
        )}
        <span className="sr-only">Bankeka Messenger</span>
      </Link>
    </Button>
  )
}

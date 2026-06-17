"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Bell, User, LogOut, Settings, HelpCircle, Menu, BookOpen, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { GlobalSearch } from "./global-search"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { MobileSidebar } from "./mobile-sidebar"
import { logout } from "@/app/actions/auth"
import { useCurrentUser } from "@/lib/use-current-user"

const initialNotifications: {
  id: number
  title: string
  description: string
  time: string
  type: string
}[] = []

/** Live UTC clock + market status pill, Bloomberg terminal style. */
function TerminalClock() {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const time = now
    ? now.toLocaleTimeString("en-GB", { hour12: false, timeZone: "UTC" })
    : "--:--:--"

  return (
    <div className="hidden lg:flex items-center gap-3 rounded-sm border border-border bg-secondary px-3 py-1.5">
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-success">Live</span>
      </span>
      <span className="font-mono text-xs tabular-nums text-foreground">{time}</span>
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">UTC</span>
    </div>
  )
}

export function DashboardHeader() {
  const user = useCurrentUser()
  const [notifications, setNotifications] = useState(initialNotifications)
  return (
    <header className="sticky top-0 z-50 flex h-16 items-center justify-between border-b border-border bg-card px-4 md:px-6">
      {/* Mobile Menu */}
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Toggle menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0 w-64">
          <SheetTitle className="sr-only">Navigation menu</SheetTitle>
          <SheetDescription className="sr-only">
            Browse banking, trading, and platform sections.
          </SheetDescription>
          <MobileSidebar />
        </SheetContent>
      </Sheet>

      {/* Global Search */}
      <GlobalSearch />

      {/* Actions */}
      <div className="flex items-center gap-2">
        {/* Live UTC clock + market status */}
        <TerminalClock />

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              {notifications.length > 0 && (
                <Badge className="absolute -right-1 -top-1 h-5 w-5 rounded-full p-0 text-[10px] bg-primary text-primary-foreground flex items-center justify-center">
                  {notifications.length}
                </Badge>
              )}
              <span className="sr-only">Notifications</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>Notifications</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-0 text-xs text-primary disabled:opacity-50"
                disabled={notifications.length === 0}
                onClick={() => setNotifications([])}
              >
                Mark all read
              </Button>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center px-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary mb-2">
                  <Bell className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">No notifications</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  You&apos;re all caught up
                </p>
              </div>
            ) : (
              notifications.map((notification) => (
                <DropdownMenuItem key={notification.id} className="flex flex-col items-start gap-1 p-3 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <div
                      className={`h-2 w-2 rounded-full ${
                        notification.type === "success"
                          ? "bg-green-500"
                          : notification.type === "warning"
                          ? "bg-yellow-500"
                          : "bg-blue-500"
                      }`}
                    />
                    <span className="font-medium text-sm">{notification.title}</span>
                  </div>
                  <span className="text-xs text-muted-foreground pl-4">
                    {notification.description}
                  </span>
                  <span className="text-[10px] text-muted-foreground pl-4">
                    {notification.time}
                  </span>
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="justify-center text-primary cursor-pointer">
              <Link href="/dashboard/transactions">View all activity</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2 px-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                  {user.initials}
                </AvatarFallback>
              </Avatar>
              <div className="hidden md:flex flex-col items-start">
                <span className="text-sm font-medium">{user.shortName}</span>
                <span className="text-[10px] text-muted-foreground">{user.headerTag}</span>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold">{user.fullName}</span>
              <span className="text-[10px] font-normal text-muted-foreground">{user.role} · {user.company}</span>
              <span className="text-[10px] font-normal text-muted-foreground">{user.accountEmail}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/dashboard/profile">
                <User className="mr-2 h-4 w-4" />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/settings">
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/handbook">
                <BookOpen className="mr-2 h-4 w-4" />
                Client Handbook
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/support">
                <HelpCircle className="mr-2 h-4 w-4" />
                Support
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/admin">
                <ShieldCheck className="mr-2 h-4 w-4" />
                Administrator
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <form action={logout}>
              <DropdownMenuItem
                className="text-destructive cursor-pointer"
                onSelect={(e) => e.preventDefault()}
                asChild
              >
                <button type="submit" className="flex w-full items-center">
                  <LogOut className="mr-2 h-4 w-4" />
                  Log out
                </button>
              </DropdownMenuItem>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}

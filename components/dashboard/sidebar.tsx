"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  ArrowLeftRight,
  CreditCard,
  FileText,
  TrendingUp,
  DollarSign,
  Building2,
  Shield,
  Settings,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Landmark,
  Globe,
  Users,
  Headset,
  Cpu,
  BookOpen,
  ShieldCheck,
  Banknote,
  Layers,
  Ship,
  Gauge,
  type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

type NavItem = {
  title: string
  href: string
  icon: LucideIcon
  badge?: string
}

type NavGroup = {
  label: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    label: "Banking",
    items: [
      { title: "Overview", href: "/dashboard", icon: LayoutDashboard },
      { title: "Payments & Payees", href: "/dashboard/payments", icon: ArrowLeftRight },
      { title: "Beneficiaries", href: "/dashboard/beneficiaries", icon: Users },
      { title: "Transactions", href: "/dashboard/transactions", icon: CreditCard },
      { title: "Live FX Rates", href: "/dashboard/exchange", icon: DollarSign },
      { title: "Bank Accounts", href: "/dashboard/accounts", icon: Building2 },
      { title: "Payment Gateway", href: "/dashboard/gateway", icon: Globe, badge: "IBAN" },
      { title: "Cards", href: "/dashboard/cards", icon: CreditCard },
    ],
  },
  {
    label: "Trading & Instruments",
    items: [
      { title: "NAFTAhub Trading", href: "/dashboard/trading", icon: Cpu, badge: "NQAi" },
      { title: "SWIFT Services", href: "/dashboard/swift", icon: Globe },
      { title: "Bank Instruments", href: "/dashboard/instruments", icon: FileText, badge: "New" },
      { title: "Institutional Desk", href: "/dashboard/institutional", icon: Banknote, badge: "DOF" },
      { title: "Securities Settlement", href: "/dashboard/dtc", icon: Layers, badge: "DTC" },
      { title: "Commodity Trading", href: "/dashboard/commodity", icon: Ship, badge: "POP/POF" },
      { title: "Leverage & Risk", href: "/dashboard/leverage", icon: Gauge, badge: "1:30" },
      { title: "Yield / PPP", href: "/dashboard/ppp", icon: TrendingUp },
      { title: "Fiduciary & Assets", href: "/dashboard/fiduciary", icon: Landmark },
    ],
  },
  {
    label: "Platform",
    items: [
      { title: "Plans & Pricing", href: "/dashboard/plans", icon: DollarSign },
      { title: "Services & Compliance", href: "/dashboard/services", icon: Shield },
      { title: "Client Handbook", href: "/dashboard/handbook", icon: BookOpen },
      { title: "Administrator", href: "/dashboard/admin", icon: ShieldCheck },
      { title: "Settings", href: "/dashboard/settings", icon: Settings },
      { title: "Support", href: "/dashboard/support", icon: HelpCircle },
    ],
  },
]

// Flattened list used for the collapsed icon-only rail.
const allNavItems: NavItem[] = navGroups.flatMap((group) => group.items)

export function DashboardSidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()

  const isActive = (href: string) => pathname === href

  const groupContainsActive = (group: NavGroup) => group.items.some((item) => isActive(item.href))

  // Open the group containing the active route by default; users can toggle the rest.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    for (const group of navGroups) {
      initial[group.label] = group.items.some((item) => item.href === pathname)
    }
    // Always have at least the first group open on initial load.
    if (!Object.values(initial).some(Boolean)) {
      initial[navGroups[0].label] = true
    }
    return initial
  })

  const toggleGroup = (label: string) => {
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }))
  }

  return (
    <aside
      className={cn(
        "relative flex h-screen flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo Section */}
      <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
        {!collapsed && (
          <Link href="/dashboard" className="flex items-center gap-2">
            <img
              src="/images/mcc-logo.png"
              alt="MCC Capital logo"
              className="h-9 w-9 rounded-full object-cover"
            />
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-sidebar-foreground">MCC Capital</span>
              <span className="text-[10px] text-muted-foreground">Swiss Banking</span>
            </div>
          </Link>
        )}
        {collapsed && (
          <img
            src="/images/mcc-logo.png"
            alt="MCC Capital logo"
            className="mx-auto h-9 w-9 rounded-full object-cover"
          />
        )}
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4 [scrollbar-gutter:stable] [scrollbar-width:thin]">
        {collapsed ? (
          // Collapsed icon-only rail: flat list, no group headers.
          <div className="space-y-1">
            {allNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                title={item.title}
                className={cn(
                  "flex items-center justify-center rounded-lg px-2 py-2 text-sm transition-colors",
                  isActive(item.href)
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="sr-only">{item.title}</span>
              </Link>
            ))}
          </div>
        ) : (
          // Expanded: dynamic dropdown/accordion groups.
          <div className="space-y-2">
            {navGroups.map((group) => {
              const open = openGroups[group.label] ?? false
              return (
                <Collapsible key={group.label} open={open} onOpenChange={() => toggleGroup(group.label)}>
                  <CollapsibleTrigger
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg px-2 py-2 text-xs font-semibold uppercase tracking-wider transition-colors",
                      "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                      groupContainsActive(group) && "text-sidebar-foreground"
                    )}
                  >
                    <span className="flex items-center gap-2">
                      {group.label}
                      {groupContainsActive(group) && !open && (
                        <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                      )}
                    </span>
                    <ChevronDown
                      className={cn("h-4 w-4 shrink-0 transition-transform duration-200", open && "rotate-180")}
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
                    <div className="mt-1 space-y-1 pb-1">
                      {group.items.map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={cn(
                            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                            isActive(item.href)
                              ? "bg-sidebar-accent text-sidebar-accent-foreground"
                              : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                          )}
                        >
                          <item.icon className="h-4 w-4 shrink-0" />
                          <span className="flex-1">{item.title}</span>
                          {item.badge && (
                            <Badge
                              variant="secondary"
                              className="h-5 px-1.5 text-[10px] bg-primary/20 text-primary"
                            >
                              {item.badge}
                            </Badge>
                          )}
                        </Link>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )
            })}
          </div>
        )}
      </nav>

      {/* Relationship Manager + Account Tier */}
      {!collapsed && (
        <div className="space-y-3 border-t border-sidebar-border p-4">
          <div className="rounded-lg bg-gradient-to-r from-primary/20 to-primary/5 p-3">
            <div className="flex items-center gap-2">
              <Badge className="bg-primary text-primary-foreground text-[10px]">PRO</Badge>
              <span className="text-xs text-sidebar-foreground">Active Plan</span>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">Unlimited trading volume</p>
          </div>
          <div className="rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-3">
            <div className="flex items-center gap-2">
              <Headset className="h-4 w-4 text-primary" />
              <span className="text-xs font-semibold text-sidebar-foreground">Relationship Manager</span>
            </div>
            <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
              Sophie Laurent is available 24/7 for priority clients.
            </p>
            <Button asChild size="sm" className="mt-2 h-8 w-full text-xs">
              <Link href="/dashboard/support">Contact RM</Link>
            </Button>
          </div>
        </div>
      )}

      {/* Collapse Toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute -right-3 top-20 h-6 w-6 rounded-full border border-sidebar-border bg-sidebar shadow-md"
        onClick={() => setCollapsed(!collapsed)}
      >
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
      </Button>
    </aside>
  )
}

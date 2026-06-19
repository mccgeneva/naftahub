"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import useSWR from "swr"
import {
  ArrowLeft,
  MessageSquarePlus,
  Search,
  Send,
  ShieldCheck,
  MessagesSquare,
  Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { MessageBubble } from "./message-bubble"
import { MessageStatusIcon } from "./message-status"
import type {
  BankekaConversation,
  BankekaMessage,
  BankekaParticipant,
} from "@/lib/bankeka-shared"

interface ThreadResult {
  participant: BankekaParticipant
  messages: BankekaMessage[]
}
type SendResult = { ok: true; message: BankekaMessage } | { ok: false; error: string }

export interface MessengerProps {
  /** Unique cache namespace so the client and admin messengers never collide. */
  scope: string
  fetchConversations: () => Promise<BankekaConversation[]>
  fetchThread: (otherId: string) => Promise<ThreadResult | null>
  send: (otherId: string, body: string) => Promise<SendResult>
  /** Optional contact directory enabling the "new conversation" picker. */
  fetchContacts?: () => Promise<BankekaParticipant[]>
  /** Shown in the empty-state panel of the conversation list. */
  emptyHint?: string
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  const diff = Date.now() - then
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "now"
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d`
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
}

export function Messenger({
  scope,
  fetchConversations,
  fetchThread,
  send,
  fetchContacts,
  emptyHint = "Select a conversation to start messaging.",
}: MessengerProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeParticipant, setActiveParticipant] = useState<BankekaParticipant | null>(null)
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)
  const [pending, setPending] = useState<Record<string, BankekaMessage[]>>({})
  const [search, setSearch] = useState("")
  const [contactsOpen, setContactsOpen] = useState(false)
  const scrollEndRef = useRef<HTMLDivElement | null>(null)

  // Conversation list — polled for near-real-time delivery & unread updates.
  const { data: conversations = [], mutate: mutateConversations } = useSWR(
    [scope, "conversations"],
    () => fetchConversations(),
    { refreshInterval: 5000, revalidateOnFocus: true },
  )

  // Active thread — polled faster while open so replies/receipts feel live.
  const { data: thread, mutate: mutateThread } = useSWR(
    activeId ? [scope, "thread", activeId] : null,
    () => (activeId ? fetchThread(activeId) : null),
    { refreshInterval: 3000, revalidateOnFocus: true },
  )

  // Contact directory for starting a new conversation.
  const { data: contacts = [] } = useSWR(
    fetchContacts && contactsOpen ? [scope, "contacts"] : null,
    () => (fetchContacts ? fetchContacts() : []),
  )

  const serverMessages = thread?.messages ?? []
  const pendingForActive = activeId ? pending[activeId] ?? [] : []
  const messages = useMemo(
    () => [...serverMessages, ...pendingForActive],
    [serverMessages, pendingForActive],
  )

  // Keep the resolved participant header in sync once a thread loads.
  useEffect(() => {
    if (thread?.participant) setActiveParticipant(thread.participant)
  }, [thread?.participant])

  // Auto-scroll to the newest message.
  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages.length, activeId])

  const openThread = (participant: BankekaParticipant) => {
    setActiveId(participant.id)
    setActiveParticipant(participant)
    setContactsOpen(false)
    // Opening reads incoming messages → refresh unread counts shortly after.
    setTimeout(() => mutateConversations(), 400)
  }

  const handleSend = async () => {
    const body = draft.trim()
    if (!body || !activeId || sending) return
    const tempId = `temp_${Date.now()}`
    const optimistic: BankekaMessage = {
      id: tempId,
      senderId: "me",
      recipientId: activeId,
      body,
      kind: "direct",
      createdAt: new Date().toISOString(),
      outgoing: true,
      status: "sent",
    }
    setPending((p) => ({ ...p, [activeId]: [...(p[activeId] ?? []), optimistic] }))
    setDraft("")
    setSending(true)
    try {
      const res = await send(activeId, body)
      if (!res.ok) {
        toast.error(res.error)
        setDraft(body)
      }
    } catch {
      toast.error("Could not send the message.")
      setDraft(body)
    } finally {
      // Drop the optimistic echo and pull the authoritative thread + list.
      setPending((p) => ({ ...p, [activeId]: (p[activeId] ?? []).filter((m) => m.id !== tempId) }))
      setSending(false)
      await Promise.all([mutateThread(), mutateConversations()])
    }
  }

  const filteredConversations = conversations.filter((c) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      c.participant.name.toLowerCase().includes(q) ||
      c.participant.company.toLowerCase().includes(q) ||
      c.lastMessage.toLowerCase().includes(q)
    )
  })

  return (
    <div className="flex h-[calc(100vh-12rem)] min-h-[28rem] overflow-hidden rounded-xl border border-border bg-card">
      {/* Conversation list */}
      <div
        className={cn(
          "flex w-full flex-col border-r border-border md:w-80 md:shrink-0",
          activeId ? "hidden md:flex" : "flex",
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border p-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search messages"
              className="h-9 pl-8 text-base md:text-sm"
              aria-label="Search conversations"
            />
          </div>
          {fetchContacts && (
            <Dialog open={contactsOpen} onOpenChange={setContactsOpen}>
              <DialogTrigger asChild>
                <Button size="icon" variant="secondary" className="h-9 w-9 shrink-0" aria-label="New conversation">
                  <MessageSquarePlus className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>New conversation</DialogTitle>
                  <DialogDescription>
                    Choose a contact to start a private, encrypted-in-transit thread.
                  </DialogDescription>
                </DialogHeader>
                <ScrollArea className="max-h-80 pr-2">
                  <div className="space-y-1">
                    {contacts.length === 0 ? (
                      <p className="py-6 text-center text-sm text-muted-foreground">
                        No other contacts available yet.
                      </p>
                    ) : (
                      contacts.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => openThread(p)}
                          className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-secondary"
                        >
                          <Avatar className="h-9 w-9">
                            <AvatarFallback
                              className={cn(
                                "text-xs",
                                p.isAdmin ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground",
                              )}
                            >
                              {p.isAdmin ? <ShieldCheck className="h-4 w-4" /> : p.initials}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                            {p.company && (
                              <p className="truncate text-xs text-muted-foreground">{p.company}</p>
                            )}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </DialogContent>
            </Dialog>
          )}
        </div>

        <ScrollArea className="flex-1">
          {filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
                <MessagesSquare className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">No conversations yet</p>
              <p className="text-xs text-muted-foreground text-pretty">{emptyHint}</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {filteredConversations.map((c) => (
                <li key={c.participant.id}>
                  <button
                    type="button"
                    onClick={() => openThread(c.participant)}
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-secondary",
                      activeId === c.participant.id && "bg-secondary",
                    )}
                  >
                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarFallback
                        className={cn(
                          "text-xs",
                          c.participant.isAdmin
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary text-foreground",
                        )}
                      >
                        {c.participant.isAdmin ? <ShieldCheck className="h-5 w-5" /> : c.participant.initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {c.participant.name}
                        </p>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {relativeTime(c.lastMessageAt)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1">
                        {c.lastOutgoing && (
                          <MessageStatusIcon status={c.lastStatus} className="text-muted-foreground" />
                        )}
                        <p
                          className={cn(
                            "truncate text-xs",
                            c.unread > 0 ? "font-medium text-foreground" : "text-muted-foreground",
                          )}
                        >
                          {c.lastMessage}
                        </p>
                        {c.unread > 0 && (
                          <Badge className="ml-auto h-5 min-w-5 shrink-0 justify-center rounded-full px-1.5 text-[10px]">
                            {c.unread}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </div>

      {/* Thread view */}
      <div className={cn("flex flex-1 flex-col", activeId ? "flex" : "hidden md:flex")}>
        {!activeId || !activeParticipant ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary">
              <MessagesSquare className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">Bankeka Messenger</p>
            <p className="max-w-xs text-xs text-muted-foreground text-pretty">{emptyHint}</p>
          </div>
        ) : (
          <>
            {/* Thread header */}
            <div className="flex items-center gap-3 border-b border-border p-3">
              <Button
                size="icon"
                variant="ghost"
                className="md:hidden"
                onClick={() => setActiveId(null)}
                aria-label="Back to conversations"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <Avatar className="h-9 w-9">
                <AvatarFallback
                  className={cn(
                    "text-xs",
                    activeParticipant.isAdmin
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-foreground",
                  )}
                >
                  {activeParticipant.isAdmin ? <ShieldCheck className="h-4 w-4" /> : activeParticipant.initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{activeParticipant.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {activeParticipant.isAdmin
                    ? "Official platform channel"
                    : activeParticipant.company || "Private thread"}
                </p>
              </div>
              <Badge variant="secondary" className="ml-auto hidden items-center gap-1 text-[10px] sm:flex">
                <ShieldCheck className="h-3 w-3 text-success" />
                Private
              </Badge>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 bg-background/40">
              <div className="flex flex-col gap-2 p-4">
                {messages.length === 0 ? (
                  <p className="py-10 text-center text-xs text-muted-foreground">
                    No messages yet. Say hello to start the conversation.
                  </p>
                ) : (
                  messages.map((m) => (
                    <MessageBubble key={m.id} message={m} pending={m.id.startsWith("temp_")} />
                  ))
                )}
                <div ref={scrollEndRef} />
              </div>
            </ScrollArea>

            {/* Composer */}
            <div className="flex items-end gap-2 border-t border-border p-3">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                placeholder="Type a message"
                rows={1}
                className="max-h-32 min-h-[44px] resize-none text-base md:text-sm"
                aria-label="Message"
              />
              <Button
                size="icon"
                className="h-11 w-11 shrink-0"
                onClick={handleSend}
                disabled={sending || !draft.trim()}
                aria-label="Send message"
              >
                {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

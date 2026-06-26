"use client"

import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from "react"
import {
  Plus,
  Trash2,
  Loader2,
  MessageSquare,
  Folder,
  FolderOpen,
  FolderPlus,
  ChevronRight,
  MoreHorizontal,
  Pencil,
  FolderInput,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { NqaiFolder, NqaiThreadSummary } from "@/lib/nqai-chat-db"

/** Root drop-zone sentinel (distinct from a real folder id). */
export const ROOT_DROP = "__root__"

// ---------------------------------------------------------------------------
// Tree helpers
// ---------------------------------------------------------------------------

function childFolders(folders: NqaiFolder[], parentId: string | null): NqaiFolder[] {
  return folders
    .filter((f) => f.parentId === parentId)
    .sort((a, b) => a.name.localeCompare(b.name))
}

function folderThreads(threads: NqaiThreadSummary[], folderId: string | null): NqaiThreadSummary[] {
  return threads.filter((t) => (t.folderId ?? null) === folderId)
}

/** Collect a folder's id and all descendant folder ids (for move guards). */
export function folderSubtreeIds(folders: NqaiFolder[], folderId: string): Set<string> {
  const out = new Set<string>([folderId])
  let added = true
  while (added) {
    added = false
    for (const f of folders) {
      if (f.parentId && out.has(f.parentId) && !out.has(f.id)) {
        out.add(f.id)
        added = true
      }
    }
  }
  return out
}

/** Recursive count of all threads inside a folder (including subfolders). */
function deepThreadCount(folders: NqaiFolder[], threads: NqaiThreadSummary[], folderId: string): number {
  const ids = folderSubtreeIds(folders, folderId)
  return threads.filter((t) => t.folderId && ids.has(t.folderId)).length
}

/** Flatten folders into an indented list for "Move to…" pickers. */
function flattenForPicker(
  folders: NqaiFolder[],
  exclude: Set<string>,
  parentId: string | null = null,
  depth = 0,
): { id: string; name: string; depth: number }[] {
  const out: { id: string; name: string; depth: number }[] = []
  for (const f of childFolders(folders, parentId)) {
    if (exclude.has(f.id)) continue
    out.push({ id: f.id, name: f.name, depth })
    out.push(...flattenForPicker(folders, exclude, f.id, depth + 1))
  }
  return out
}

// ---------------------------------------------------------------------------
// Shared context so the recursive nodes don't need deep prop drilling
// ---------------------------------------------------------------------------

interface OrganizerCtx {
  folders: NqaiFolder[]
  threads: NqaiThreadSummary[]
  activeThreadId: string | null
  loadingThreadId: string | null
  expanded: Set<string>
  toggle: (id: string) => void
  focusedFolderId: string | null
  setFocusedFolderId: (id: string | null) => void
  renamingId: string | null
  setRenamingId: (id: string | null) => void
  onSelectThread: (id: string) => void
  onDeleteThread: (id: string) => void
  onRenameThread: (id: string, title: string) => void
  onCreateFolder: (parentId: string | null) => void
  onRenameFolder: (id: string, name: string) => void
  onDeleteFolder: (id: string) => void
  onMoveThread: (threadId: string, folderId: string | null) => void
  onMoveFolder: (folderId: string, parentId: string | null) => void
  drag: { type: "thread" | "folder"; id: string } | null
  setDrag: (v: { type: "thread" | "folder"; id: string } | null) => void
  dropTarget: string | null
  setDropTarget: (v: string | null) => void
}

const OrganizerContext = createContext<OrganizerCtx | null>(null)
function useOrganizer() {
  const ctx = useContext(OrganizerContext)
  if (!ctx) throw new Error("useOrganizer must be used within OrganizerProvider")
  return ctx
}

// ---------------------------------------------------------------------------
// Inline rename editor
// ---------------------------------------------------------------------------

function InlineRename({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string
  onCommit: (value: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(initial)
  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault()
          onCommit(value.trim())
        } else if (e.key === "Escape") {
          e.preventDefault()
          onCancel()
        }
      }}
      onBlur={() => {
        const v = value.trim()
        if (v && v !== initial) onCommit(v)
        else onCancel()
      }}
      className="min-w-0 flex-1 rounded-sm border border-primary/50 bg-background px-1 py-0.5 text-xs text-foreground focus:outline-none"
      aria-label="Rename"
    />
  )
}

// ---------------------------------------------------------------------------
// "Move to…" submenu (shared by folder + thread menus)
// ---------------------------------------------------------------------------

function MoveToSubmenu({
  exclude,
  currentFolderId,
  onPick,
}: {
  exclude: Set<string>
  currentFolderId: string | null
  onPick: (folderId: string | null) => void
}) {
  const { folders } = useOrganizer()
  const options = useMemo(() => flattenForPicker(folders, exclude), [folders, exclude])
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="gap-2 text-xs">
        <FolderInput className="h-3.5 w-3.5" />
        Move to…
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
        <DropdownMenuItem
          className="gap-2 text-xs"
          disabled={currentFolderId === null}
          onSelect={() => onPick(null)}
        >
          <Folder className="h-3.5 w-3.5" />
          Unfiled (root)
        </DropdownMenuItem>
        {options.length > 0 && <DropdownMenuSeparator />}
        {options.map((o) => (
          <DropdownMenuItem
            key={o.id}
            className="gap-2 text-xs"
            disabled={o.id === currentFolderId}
            onSelect={() => onPick(o.id)}
          >
            <span style={{ width: o.depth * 10 }} aria-hidden />
            <Folder className="h-3.5 w-3.5" />
            <span className="truncate">{o.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

// ---------------------------------------------------------------------------
// Thread row
// ---------------------------------------------------------------------------

function ThreadRow({ thread, depth }: { thread: NqaiThreadSummary; depth: number }) {
  const o = useOrganizer()
  const isActive = thread.id === o.activeThreadId
  const isLoading = thread.id === o.loadingThreadId
  const isRenaming = o.renamingId === `t:${thread.id}`

  return (
    <div
      draggable={!isRenaming}
      onDragStart={(e) => {
        o.setDrag({ type: "thread", id: thread.id })
        e.dataTransfer.effectAllowed = "move"
        e.dataTransfer.setData("text/plain", thread.id)
      }}
      onDragEnd={() => {
        o.setDrag(null)
        o.setDropTarget(null)
      }}
      style={{ paddingLeft: depth * 12 + 8 }}
      className={cn(
        "group flex items-center gap-1.5 rounded-sm border py-1.5 pr-1 transition-colors",
        isActive
          ? "border-primary/40 bg-primary/10"
          : "border-transparent hover:border-border hover:bg-secondary/50",
      )}
    >
      {isLoading ? (
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
      ) : (
        <MessageSquare className={cn("h-3.5 w-3.5 shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
      )}
      {isRenaming ? (
        <InlineRename
          initial={thread.title || ""}
          onCommit={(v) => {
            o.onRenameThread(thread.id, v)
            o.setRenamingId(null)
          }}
          onCancel={() => o.setRenamingId(null)}
        />
      ) : (
        <button
          type="button"
          onClick={() => o.onSelectThread(thread.id)}
          className="flex min-w-0 flex-1 flex-col text-left"
          aria-label={`Open conversation: ${thread.title || "Untitled"}`}
        >
          <span className="truncate text-xs font-medium text-foreground">
            {thread.title || "Untitled conversation"}
          </span>
        </button>
      )}
      <ThreadMenu thread={thread} />
    </div>
  )
}

function ThreadMenu({ thread }: { thread: NqaiThreadSummary }) {
  const o = useOrganizer()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="shrink-0 rounded-sm p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus:opacity-100 group-hover:opacity-100"
          aria-label="Conversation actions"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem className="gap-2 text-xs" onSelect={() => o.setRenamingId(`t:${thread.id}`)}>
          <Pencil className="h-3.5 w-3.5" />
          Rename
        </DropdownMenuItem>
        <MoveToSubmenu
          exclude={new Set()}
          currentFolderId={thread.folderId ?? null}
          onPick={(fid) => o.onMoveThread(thread.id, fid)}
        />
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2 text-xs text-destructive focus:text-destructive"
          onSelect={() => o.onDeleteThread(thread.id)}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ---------------------------------------------------------------------------
// Folder row (recursive)
// ---------------------------------------------------------------------------

function FolderNode({ folder, depth }: { folder: NqaiFolder; depth: number }) {
  const o = useOrganizer()
  const isOpen = o.expanded.has(folder.id)
  const isRenaming = o.renamingId === `f:${folder.id}`
  const isDropTarget = o.dropTarget === folder.id
  const subFolders = childFolders(o.folders, folder.id)
  const threads = folderThreads(o.threads, folder.id)
  const count = deepThreadCount(o.folders, o.threads, folder.id)

  // A folder cannot be dropped into itself or one of its own descendants.
  const canAcceptDrag = (() => {
    if (!o.drag) return false
    if (o.drag.type === "thread") return true
    return !folderSubtreeIds(o.folders, o.drag.id).has(folder.id)
  })()

  const handleDrop = () => {
    if (!o.drag) return
    if (o.drag.type === "thread") o.onMoveThread(o.drag.id, folder.id)
    else if (canAcceptDrag) o.onMoveFolder(o.drag.id, folder.id)
    o.setDrag(null)
    o.setDropTarget(null)
  }

  return (
    <div>
      <div
        draggable={!isRenaming}
        onDragStart={(e) => {
          o.setDrag({ type: "folder", id: folder.id })
          e.dataTransfer.effectAllowed = "move"
          e.dataTransfer.setData("text/plain", folder.id)
        }}
        onDragEnd={() => {
          o.setDrag(null)
          o.setDropTarget(null)
        }}
        onDragOver={(e) => {
          if (!o.drag || !canAcceptDrag) return
          e.preventDefault()
          if (o.dropTarget !== folder.id) o.setDropTarget(folder.id)
        }}
        onDragLeave={() => {
          if (o.dropTarget === folder.id) o.setDropTarget(null)
        }}
        onDrop={handleDrop}
        style={{ paddingLeft: depth * 12 + 4 }}
        className={cn(
          "group flex items-center gap-1 rounded-sm border py-1.5 pr-1 transition-colors",
          isDropTarget
            ? "border-primary bg-primary/15"
            : o.focusedFolderId === folder.id
              ? "border-primary/40 bg-primary/5"
              : "border-transparent hover:border-border hover:bg-secondary/40",
        )}
      >
        <button
          type="button"
          onClick={() => o.toggle(folder.id)}
          className="shrink-0 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
          aria-label={isOpen ? "Collapse folder" : "Expand folder"}
        >
          <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-90")} />
        </button>
        {isOpen ? (
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-primary" />
        ) : (
          <Folder className="h-3.5 w-3.5 shrink-0 text-primary" />
        )}
        {isRenaming ? (
          <InlineRename
            initial={folder.name}
            onCommit={(v) => {
              o.onRenameFolder(folder.id, v)
              o.setRenamingId(null)
            }}
            onCancel={() => o.setRenamingId(null)}
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              o.toggle(folder.id)
              o.setFocusedFolderId(folder.id)
            }}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          >
            <span className="truncate text-xs font-medium text-foreground">{folder.name}</span>
            {count > 0 && <span className="shrink-0 text-[10px] text-muted-foreground">{count}</span>}
          </button>
        )}
        <FolderMenu folder={folder} />
      </div>

      {isOpen && (
        <div>
          {subFolders.map((f) => (
            <FolderNode key={f.id} folder={f} depth={depth + 1} />
          ))}
          {threads.map((t) => (
            <ThreadRow key={t.id} thread={t} depth={depth + 1} />
          ))}
          {subFolders.length === 0 && threads.length === 0 && (
            <p style={{ paddingLeft: (depth + 1) * 12 + 8 }} className="py-1 text-[10px] italic text-muted-foreground">
              Empty folder
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function FolderMenu({ folder }: { folder: NqaiFolder }) {
  const o = useOrganizer()
  const exclude = useMemo(() => folderSubtreeIds(o.folders, folder.id), [o.folders, folder.id])
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="shrink-0 rounded-sm p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus:opacity-100 group-hover:opacity-100"
          aria-label="Folder actions"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem className="gap-2 text-xs" onSelect={() => o.onCreateFolder(folder.id)}>
          <FolderPlus className="h-3.5 w-3.5" />
          New subfolder
        </DropdownMenuItem>
        <DropdownMenuItem className="gap-2 text-xs" onSelect={() => o.setRenamingId(`f:${folder.id}`)}>
          <Pencil className="h-3.5 w-3.5" />
          Rename
        </DropdownMenuItem>
        <MoveToSubmenu exclude={exclude} currentFolderId={folder.parentId} onPick={(pid) => o.onMoveFolder(folder.id, pid)} />
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2 text-xs text-destructive focus:text-destructive"
          onSelect={() => o.onDeleteFolder(folder.id)}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete folder
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ---------------------------------------------------------------------------
// Root drop zone (drag here to unfile)
// ---------------------------------------------------------------------------

function RootArea({ children }: { children: ReactNode }) {
  const o = useOrganizer()
  const isTarget = o.dropTarget === ROOT_DROP
  return (
    <div
      onDragOver={(e) => {
        if (!o.drag) return
        e.preventDefault()
        if (o.dropTarget !== ROOT_DROP) o.setDropTarget(ROOT_DROP)
      }}
      onDragLeave={(e) => {
        // Only clear when leaving the container entirely.
        if (e.currentTarget === e.target && o.dropTarget === ROOT_DROP) o.setDropTarget(null)
      }}
      onDrop={() => {
        if (!o.drag) return
        if (o.drag.type === "thread") o.onMoveThread(o.drag.id, null)
        else o.onMoveFolder(o.drag.id, null)
        o.setDrag(null)
        o.setDropTarget(null)
      }}
      className={cn("rounded-sm", isTarget && o.drag && "ring-1 ring-primary/50")}
    >
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Provider — wires parent state/handlers into the recursive tree
// ---------------------------------------------------------------------------

export interface OrganizerProps {
  folders: NqaiFolder[]
  threads: NqaiThreadSummary[]
  activeThreadId: string | null
  loadingThreadId: string | null
  expanded: Set<string>
  onToggle: (id: string) => void
  focusedFolderId: string | null
  onFocusFolder: (id: string | null) => void
  renamingId: string | null
  onRenamingId: (id: string | null) => void
  onSelectThread: (id: string) => void
  onDeleteThread: (id: string) => void
  onRenameThread: (id: string, title: string) => void
  onCreateFolder: (parentId: string | null) => void
  onRenameFolder: (id: string, name: string) => void
  onDeleteFolder: (id: string) => void
  onMoveThread: (threadId: string, folderId: string | null) => void
  onMoveFolder: (folderId: string, parentId: string | null) => void
}

function OrganizerProvider({ children, props }: { children: ReactNode; props: OrganizerProps }) {
  const [drag, setDrag] = useState<{ type: "thread" | "folder"; id: string } | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const value: OrganizerCtx = {
    folders: props.folders,
    threads: props.threads,
    activeThreadId: props.activeThreadId,
    loadingThreadId: props.loadingThreadId,
    expanded: props.expanded,
    toggle: props.onToggle,
    focusedFolderId: props.focusedFolderId,
    setFocusedFolderId: props.onFocusFolder,
    renamingId: props.renamingId,
    setRenamingId: props.onRenamingId,
    onSelectThread: props.onSelectThread,
    onDeleteThread: props.onDeleteThread,
    onRenameThread: props.onRenameThread,
    onCreateFolder: props.onCreateFolder,
    onRenameFolder: props.onRenameFolder,
    onDeleteFolder: props.onDeleteFolder,
    onMoveThread: props.onMoveThread,
    onMoveFolder: props.onMoveFolder,
    drag,
    setDrag,
    dropTarget,
    setDropTarget,
  }
  return <OrganizerContext.Provider value={value}>{children}</OrganizerContext.Provider>
}

// ---------------------------------------------------------------------------
// Sidebar panel
// ---------------------------------------------------------------------------

export function FolderTreePanel({
  props,
  onNewChat,
  onOpenManager,
}: {
  props: OrganizerProps
  onNewChat: () => void
  onOpenManager: () => void
}) {
  const rootFolders = childFolders(props.folders, null)
  const rootThreads = folderThreads(props.threads, null)
  const empty = props.folders.length === 0 && props.threads.length === 0

  return (
    <OrganizerProvider props={props}>
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex flex-col gap-2 border-b border-border p-3">
          <Button type="button" size="sm" onClick={onNewChat} className="w-full justify-start gap-2" aria-label="Start a new conversation">
            <Plus className="h-4 w-4" />
            New chat
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => props.onCreateFolder(null)}
              className="flex-1 justify-center gap-1.5 text-[11px]"
              aria-label="Create a new folder"
            >
              <FolderPlus className="h-3.5 w-3.5" />
              New folder
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onOpenManager}
              className="flex-1 justify-center gap-1.5 text-[11px]"
              aria-label="Open the folder manager"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              Manage
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Conversations
          </p>
          {empty ? (
            <p className="px-2 py-3 text-xs leading-relaxed text-muted-foreground">
              No saved conversations yet. Your chats are stored privately and will appear here.
            </p>
          ) : (
            <RootArea>
              <div className="flex flex-col gap-0.5">
                {rootFolders.map((f) => (
                  <FolderNode key={f.id} folder={f} depth={0} />
                ))}
                {rootThreads.length > 0 && rootFolders.length > 0 && (
                  <p className="mt-2 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Unfiled
                  </p>
                )}
                {rootThreads.map((t) => (
                  <ThreadRow key={t.id} thread={t} depth={0} />
                ))}
              </div>
            </RootArea>
          )}
        </div>
      </div>
    </OrganizerProvider>
  )
}

// ---------------------------------------------------------------------------
// Full-screen manager
// ---------------------------------------------------------------------------

function Breadcrumb({ folders, focusedId, onFocus }: { folders: NqaiFolder[]; focusedId: string | null; onFocus: (id: string | null) => void }) {
  const trail: NqaiFolder[] = []
  let cursor = focusedId
  const byId = new Map(folders.map((f) => [f.id, f]))
  let guard = 0
  while (cursor && guard++ < 1000) {
    const f = byId.get(cursor)
    if (!f) break
    trail.unshift(f)
    cursor = f.parentId
  }
  return (
    <nav className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground" aria-label="Breadcrumb">
      <button type="button" onClick={() => onFocus(null)} className={cn("rounded-sm px-1.5 py-0.5 hover:bg-secondary", !focusedId && "font-semibold text-foreground")}>
        All conversations
      </button>
      {trail.map((f) => (
        <span key={f.id} className="flex items-center gap-1">
          <ChevronRight className="h-3 w-3" />
          <button type="button" onClick={() => onFocus(f.id)} className={cn("rounded-sm px-1.5 py-0.5 hover:bg-secondary", focusedId === f.id && "font-semibold text-foreground")}>
            {f.name}
          </button>
        </span>
      ))}
    </nav>
  )
}

export function NqaiManager({
  props,
  onNewChat,
  onClose,
}: {
  props: OrganizerProps
  onNewChat: () => void
  onClose: () => void
}) {
  const focused = props.focusedFolderId
  const subFolders = childFolders(props.folders, focused)
  const threads = folderThreads(props.threads, focused)

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-5 w-5 text-primary" />
          <div className="leading-tight">
            <p className="text-sm font-semibold text-foreground">Conversation Manager</p>
            <p className="text-[11px] text-muted-foreground">Organize your NQAi chats into folders and subfolders</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => props.onCreateFolder(null)} className="gap-1.5 text-[11px]">
            <FolderPlus className="h-3.5 w-3.5" />
            New root folder
          </Button>
          <Button type="button" size="sm" onClick={onNewChat} className="gap-1.5 text-[11px]">
            <Plus className="h-3.5 w-3.5" />
            New chat
          </Button>
          <Button type="button" size="icon" variant="ghost" onClick={onClose} className="h-8 w-8 text-muted-foreground hover:text-foreground" aria-label="Close manager">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <OrganizerProvider props={props}>
        <div className="flex min-h-0 flex-1">
          {/* Left: tree */}
          <aside className="hidden w-72 shrink-0 flex-col border-r border-border bg-card md:flex">
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Folders</p>
              <RootArea>
                <div className="flex flex-col gap-0.5">
                  {childFolders(props.folders, null).map((f) => (
                    <FolderNode key={f.id} folder={f} depth={0} />
                  ))}
                  {folderThreads(props.threads, null).map((t) => (
                    <ThreadRow key={t.id} thread={t} depth={0} />
                  ))}
                </div>
              </RootArea>
            </div>
          </aside>

          {/* Right: focused folder contents */}
          <section className="flex min-h-0 flex-1 flex-col">
            <div className="border-b border-border px-4 py-3">
              <Breadcrumb folders={props.folders} focusedId={focused} onFocus={props.onFocusFolder} />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {subFolders.length === 0 && threads.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                  <Folder className="h-10 w-10 opacity-40" />
                  <p className="text-sm">This folder is empty.</p>
                  <p className="text-xs">Create a subfolder, or drag conversations here from the tree.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {subFolders.map((f) => (
                    <ManagerFolderCard key={f.id} folder={f} onFocus={props.onFocusFolder} />
                  ))}
                  {threads.map((t) => (
                    <ManagerThreadCard key={t.id} thread={t} />
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </OrganizerProvider>
    </div>
  )
}

function ManagerFolderCard({ folder, onFocus }: { folder: NqaiFolder; onFocus: (id: string) => void }) {
  const o = useOrganizer()
  const count = deepThreadCount(o.folders, o.threads, folder.id)
  const isDropTarget = o.dropTarget === folder.id
  const canAccept = !o.drag || o.drag.type === "thread" || !folderSubtreeIds(o.folders, o.drag.id).has(folder.id)
  return (
    <div
      onDragOver={(e) => {
        if (!o.drag || !canAccept) return
        e.preventDefault()
        if (o.dropTarget !== folder.id) o.setDropTarget(folder.id)
      }}
      onDragLeave={() => o.dropTarget === folder.id && o.setDropTarget(null)}
      onDrop={() => {
        if (!o.drag) return
        if (o.drag.type === "thread") o.onMoveThread(o.drag.id, folder.id)
        else if (canAccept) o.onMoveFolder(o.drag.id, folder.id)
        o.setDrag(null)
        o.setDropTarget(null)
      }}
      className={cn(
        "flex items-center gap-2 rounded-sm border bg-card p-3 transition-colors",
        isDropTarget ? "border-primary bg-primary/10" : "border-border hover:border-primary/40",
      )}
    >
      <button type="button" onClick={() => onFocus(folder.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <Folder className="h-5 w-5 shrink-0 text-primary" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-foreground">{folder.name}</span>
          <span className="block text-[11px] text-muted-foreground">{count} {count === 1 ? "chat" : "chats"}</span>
        </span>
      </button>
      <FolderMenu folder={folder} />
    </div>
  )
}

function ManagerThreadCard({ thread }: { thread: NqaiThreadSummary }) {
  const o = useOrganizer()
  return (
    <div
      draggable
      onDragStart={(e) => {
        o.setDrag({ type: "thread", id: thread.id })
        e.dataTransfer.effectAllowed = "move"
        e.dataTransfer.setData("text/plain", thread.id)
      }}
      onDragEnd={() => {
        o.setDrag(null)
        o.setDropTarget(null)
      }}
      className="flex items-center gap-2 rounded-sm border border-border bg-card p-3 transition-colors hover:border-primary/40"
    >
      <button type="button" onClick={() => o.onSelectThread(thread.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <MessageSquare className="h-5 w-5 shrink-0 text-muted-foreground" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-foreground">{thread.title || "Untitled conversation"}</span>
          <span className="block text-[11px] text-muted-foreground">{thread.messageCount} {thread.messageCount === 1 ? "message" : "messages"}</span>
        </span>
      </button>
      <ThreadMenu thread={thread} />
    </div>
  )
}

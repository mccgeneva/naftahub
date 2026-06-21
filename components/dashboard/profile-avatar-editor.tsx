"use client"

import { useEffect, useRef, useState } from "react"
import { Camera, Loader2, Trash2, Upload } from "lucide-react"
import { toast } from "sonner"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useCurrentUser, useCurrentUserActions } from "@/lib/use-current-user"

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif"
const MAX_BYTES = 5 * 1024 * 1024

/**
 * Clickable profile avatar that lets the signed-in user upload and personalize
 * their own picture. Tapping the avatar opens a dialog with a live preview, file
 * picker, save and remove controls. On success the new picture is reflected
 * instantly across the app (header, profile, …) via the shared current-user
 * context and is persisted server-side, so it survives reloads and shows on
 * every device.
 */
export function ProfileAvatarEditor() {
  const user = useCurrentUser()
  const { setAvatarUrl } = useCurrentUserActions()
  const fileInput = useRef<HTMLInputElement>(null)

  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)

  // Revoke object URLs to avoid leaks when the preview changes / dialog closes.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])

  function reset() {
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
    setFile(null)
  }

  function pickFile(selected: File | undefined) {
    if (!selected) return
    if (!selected.type.startsWith("image/")) {
      toast.error("Please choose an image file.")
      return
    }
    if (selected.size > MAX_BYTES) {
      toast.error("Image is too large (max 5 MB).")
      return
    }
    if (preview) URL.revokeObjectURL(preview)
    setFile(selected)
    setPreview(URL.createObjectURL(selected))
  }

  async function handleSave() {
    if (!file) return
    setBusy(true)
    try {
      const body = new FormData()
      body.append("file", file)
      const res = await fetch("/api/avatar", { method: "POST", body })
      const data = (await res.json()) as { url?: string; error?: string }
      if (!res.ok || !data.url) {
        toast.error(data.error || "Upload failed. Please try again.")
        return
      }
      setAvatarUrl(data.url)
      toast.success("Profile picture updated")
      reset()
      setOpen(false)
    } catch {
      toast.error("Upload failed. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove() {
    setBusy(true)
    try {
      const res = await fetch("/api/avatar", { method: "DELETE" })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast.error(data.error || "Could not remove your picture.")
        return
      }
      setAvatarUrl(null)
      toast.success("Profile picture removed")
      reset()
      setOpen(false)
    } catch {
      toast.error("Could not remove your picture.")
    } finally {
      setBusy(false)
    }
  }

  const shown = preview ?? user.avatarUrl

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative h-16 w-16 shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
        aria-label="Change profile picture"
      >
        <Avatar className="h-16 w-16">
          {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.fullName} className="object-cover" />}
          <AvatarFallback className="bg-primary text-primary-foreground text-xl">{user.initials}</AvatarFallback>
        </Avatar>
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-foreground/50 opacity-0 transition-opacity group-hover:opacity-100">
          <Camera className="h-5 w-5 text-background" />
        </span>
      </button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (busy) return
          if (!o) reset()
          setOpen(o)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Profile picture</DialogTitle>
            <DialogDescription>
              Upload a photo to personalize your account. PNG, JPG, WEBP or GIF, up to 5 MB.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-4 py-2">
            <Avatar className="h-28 w-28">
              {shown && <AvatarImage src={shown} alt="Preview" className="object-cover" />}
              <AvatarFallback className="bg-primary text-primary-foreground text-3xl">{user.initials}</AvatarFallback>
            </Avatar>

            <input
              ref={fileInput}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
            <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={busy} className="gap-2">
              <Upload className="h-4 w-4" />
              {shown ? "Choose a different photo" : "Choose a photo"}
            </Button>
          </div>

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            {user.avatarUrl ? (
              <Button variant="ghost" onClick={handleRemove} disabled={busy} className="gap-2 text-destructive">
                <Trash2 className="h-4 w-4" />
                Remove
              </Button>
            ) : (
              <span />
            )}
            <Button onClick={handleSave} disabled={!file || busy} className="gap-2">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save picture
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

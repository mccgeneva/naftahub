import { type NextRequest, NextResponse } from "next/server"
import { put, del } from "@vercel/blob"
import { resolveCurrentSession } from "@/lib/session-user"
import { updateDynamicUserProfile, getDynamicUserById } from "@/lib/admin-users-db"

// ---------------------------------------------------------------------------
// Self-service profile picture.
//
// A signed-in user can upload (POST) or remove (DELETE) their OWN avatar. The
// image is stored in the public Blob store and its URL is persisted onto the
// user's profile (lib/admin-users-db) so it survives reloads and shows on every
// device — exactly like the rest of their identity, which the client hydrates
// from the session. Identity is always resolved from the httpOnly session
// cookie, so a user can only ever change their own picture.
// ---------------------------------------------------------------------------

const MAX_BYTES = 5 * 1024 * 1024 // 5 MB
const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/gif"]

export async function POST(request: NextRequest) {
  try {
    const session = await resolveCurrentSession()
    if (!session || session.kind !== "dynamic") {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get("file") as File | null
    if (!file) {
      return NextResponse.json({ error: "No image provided." }, { status: 400 })
    }
    if (!ALLOWED.includes(file.type)) {
      return NextResponse.json({ error: "Please upload a PNG, JPG, WEBP, or GIF image." }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Image is too large (max 5 MB)." }, { status: 400 })
    }

    const ext = file.type.split("/")[1]?.replace("jpeg", "jpg") || "png"
    // Per-user, content-addressed-ish path. randomSuffix avoids stale CDN caches
    // when the user replaces their picture.
    const blob = await put(`avatars/${session.id}.${ext}`, file, {
      access: "public",
      addRandomSuffix: true,
      contentType: file.type,
    })

    // Best-effort cleanup of the previous picture so the store doesn't grow
    // unbounded as a user re-uploads.
    const existing = await getDynamicUserById(session.id)
    const previous = existing?.profile.avatarUrl
    if (previous && previous !== blob.url) {
      void del(previous).catch(() => {})
    }

    const updated = await updateDynamicUserProfile(session.id, {
      profile: { ...existing!.profile, avatarUrl: blob.url },
    })
    if (!updated) {
      return NextResponse.json({ error: "Could not save your picture." }, { status: 500 })
    }

    return NextResponse.json({ url: blob.url })
  } catch (error) {
    console.log("[v0] avatar upload error:", (error as Error).message)
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const session = await resolveCurrentSession()
    if (!session || session.kind !== "dynamic") {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 })
    }
    const existing = await getDynamicUserById(session.id)
    if (!existing) return NextResponse.json({ error: "Account not found." }, { status: 404 })

    const previous = existing.profile.avatarUrl
    const nextProfile = { ...existing.profile }
    delete nextProfile.avatarUrl
    await updateDynamicUserProfile(session.id, { profile: nextProfile })
    if (previous) void del(previous).catch(() => {})

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.log("[v0] avatar delete error:", (error as Error).message)
    return NextResponse.json({ error: "Could not remove your picture." }, { status: 500 })
  }
}

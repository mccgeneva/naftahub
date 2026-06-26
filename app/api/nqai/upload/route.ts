import { put } from "@vercel/blob"
import { resolveCurrentSession } from "@/lib/session-user"

// Uploads a single document for NQAi to analyze. Files are stored in Blob under
// an unguessable, per-user prefix and the public URL is handed back to the
// client, which then attaches it to the next chat message as a file part. The
// Anthropic provider fetches that URL directly (URL source) so we never inline
// base64 into the persisted transcript — keeping the chat row lightweight.
export const runtime = "nodejs"
export const maxDuration = 30

const MAX_BYTES = 20 * 1024 * 1024 // 20 MB — comfortably within Claude's limits

// Accepted upload types → the media type we tag the attachment with for the
// model. CSV is normalised to text/plain because Anthropic ingests it as a
// plain-text document (it has no dedicated CSV content block).
const ACCEPTED: Record<string, string> = {
  "application/pdf": "application/pdf",
  "image/png": "image/png",
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/webp": "image/webp",
  "image/gif": "image/gif",
  "text/plain": "text/plain",
  "text/csv": "text/plain",
  "application/csv": "text/plain",
}

// Fallback when the browser sends a blank/octet-stream type: infer from the
// file extension so .csv / .txt / images / pdf still resolve.
const EXT_MEDIA: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  txt: "text/plain",
  text: "text/plain",
  csv: "text/plain",
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

export async function POST(req: Request) {
  const session = await resolveCurrentSession()
  if (!session?.id) {
    return json({ error: "You must be signed in to upload documents." }, 401)
  }

  let file: File | null = null
  try {
    const form = await req.formData()
    const f = form.get("file")
    if (f instanceof File) file = f
  } catch {
    return json({ error: "Invalid upload request." }, 400)
  }
  if (!file) return json({ error: "No file provided." }, 400)
  if (file.size === 0) return json({ error: "The file is empty." }, 400)
  if (file.size > MAX_BYTES) {
    return json({ error: "File is too large. The maximum size is 20 MB." }, 413)
  }

  const ext = (file.name.split(".").pop() || "").toLowerCase()
  const mediaType = ACCEPTED[file.type] || EXT_MEDIA[ext] || ""
  if (!mediaType) {
    return json(
      { error: "Unsupported file type. Upload a PDF, image (PNG/JPG/WEBP/GIF), text or CSV file." },
      415,
    )
  }

  // Sanitize the filename for the storage key (the original name is preserved
  // in the response and shown in the UI / sent to the model as the title).
  const safeName = (file.name || "document").replace(/[^\w.\- ]+/g, "_").slice(-100)

  try {
    const blob = await put(`nqai/${session.id}/${crypto.randomUUID()}-${safeName}`, file, {
      access: "public",
      addRandomSuffix: true,
      contentType: file.type || mediaType,
    })
    return json(
      { url: blob.url, name: file.name || safeName, mediaType, size: file.size },
      200,
    )
  } catch (err) {
    console.log("[v0] NQAi upload failed:", err instanceof Error ? err.message : String(err))
    return json({ error: "Upload failed. Please try again." }, 500)
  }
}

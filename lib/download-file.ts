/**
 * Save a file WITHOUT navigating the page.
 *
 * Inside the installed PWA / in-app webview there is no browser chrome, so a
 * plain `<a href target="_blank">` or even `<a download>` just navigates the
 * single webview to the raw Blob URL and strands the user with no way back
 * (the "open a document, can't exit" trap). This helper instead fetches the
 * bytes and hands them to the native share sheet on mobile (Save to Files),
 * or triggers an object-URL download on desktop — never a bare navigation.
 *
 * Returns true if a save/share was initiated (or cancelled by the user),
 * false only if the file could not be fetched.
 */
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
}

// Stored blobs are sometimes served with a wrong or generic Content-Type, so the
// real type is read from the file's leading bytes. A file saved without a
// matching type + extension is unreadable on iOS ("not a valid image").
async function sniffMime(blob: Blob): Promise<string | null> {
  const b = new Uint8Array(await blob.slice(0, 12).arrayBuffer())
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg"
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png"
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif"
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "application/pdf"
  const ascii = String.fromCharCode(...b)
  if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") return "image/webp"
  if (ascii.slice(4, 8) === "ftyp") {
    const brand = ascii.slice(8, 12)
    if (brand.startsWith("hei") || brand.startsWith("hev")) return "image/heic"
    if (brand.startsWith("mif") || brand.startsWith("msf")) return "image/heif"
  }
  return null
}

function withExtension(name: string, ext: string | undefined): string {
  const safe = name.replace(/[\\/:*?"<>|]+/g, "-").trim() || "document"
  if (!ext) return safe
  const current = safe.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase()
  if (current === ext || (ext === "jpg" && current === "jpeg")) return safe
  return `${safe.replace(/\.[a-z0-9]{2,5}$/i, "")}.${ext}`
}

export async function downloadFile(url: string, filename?: string): Promise<boolean> {
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`)
    const raw = await res.blob()
    const declared = (raw.type || "").split(";")[0].trim().toLowerCase()
    const mime = (await sniffMime(raw)) ?? (declared || "application/octet-stream")
    const blob = mime === declared ? raw : new Blob([raw], { type: mime })
    const name = withExtension(filename && filename.trim() ? filename.trim() : "document", EXT_BY_MIME[mime])
    const file = new File([blob], name, { type: mime })

    const nav = navigator as Navigator & {
      canShare?: (data: { files: File[] }) => boolean
    }
    if (typeof nav.share === "function" && nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: name })
        return true
      } catch (err) {
        // User dismissed the share sheet — that's a successful "no-op", NOT a
        // failure, and we must NOT fall through to a navigation.
        if ((err as Error).name === "AbortError") return true
        // Any other share error: fall through to the object-URL download.
      }
    }

    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = objectUrl
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(objectUrl), 4000)
    return true
  } catch {
    return false
  }
}

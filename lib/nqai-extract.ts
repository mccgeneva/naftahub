import "server-only"

// NOTE: sharp / mammoth / word-extractor are imported LAZILY inside the branches
// that need them (see below). sharp in particular is a native addon; importing
// it at module top-level meant that if its binary failed to resolve in the
// serverless runtime, the whole module threw and the upload route 500'd for
// EVERY file — including genuine JPEGs that are a pure pass-through and never
// need sharp at all. Lazy-loading isolates each converter to the file types
// that actually use it.

/**
 * Turns an uploaded file into something the Anthropic model can actually ingest.
 *
 * The model only reads three shapes over a URL source: PDF, images
 * (PNG/JPEG/GIF/WEBP) and plain text. So:
 *   - native types (pdf, jpg/jpeg/png/webp/gif, txt/csv) pass straight through;
 *   - Office/rich text (docx, doc, rtf) are extracted to plain text;
 *   - TIFF (which the model can't view) is converted to PNG;
 *   - .bin / unknown binary is decoded as UTF-8 text when it looks textual,
 *     otherwise summarised as a hex preview so the model still has something to
 *     analyse.
 *
 * The route stores the RESULT of this in Blob and hands its URL to the model, so
 * a derived text/image is what gets fetched — never the raw Office/TIFF bytes.
 */

export interface ResolvedUpload {
  /** Bytes to store in Blob and hand to the model. */
  body: Buffer | string
  /** Media type the model ingests this as (pdf | image/* | text/plain). */
  mediaType: string
  /** Content-Type header to store the Blob with. */
  contentType: string
}

export interface ResolveError {
  error: string
}

/** Cap extracted text so a pathological document can't produce a huge blob. */
const MAX_TEXT_CHARS = 500_000

/** Native (pass-through) upload types → the media type we tag them with. */
const NATIVE: Record<string, string> = {
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

/** Extension → native media type, for when the browser sends a blank type. */
const NATIVE_EXT: Record<string, string> = {
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

function extensionOf(name: string): string {
  return (name.split(".").pop() || "").toLowerCase()
}

/** Media types the Anthropic model can view directly over a URL source. */
const MODEL_VIEWABLE_IMAGE = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"])

/**
 * Sniff the real image kind from magic bytes, independent of filename/MIME.
 * iPhones save photos as HEIC and in-app browser webviews frequently hand over
 * the original HEIC bytes even when the file is named "IMG_1769.jpeg", so we
 * cannot trust the extension. Returns "heic" | "web" (jpeg/png/gif/webp/bmp) |
 * "tiff" | "other".
 */
function sniffImage(buf: Buffer): "heic" | "web" | "tiff" | "other" {
  if (buf.length < 12) return "other"
  // ISO-BMFF (HEIC/HEIF/AVIF): bytes 4-8 = "ftyp", brand at 8-12.
  if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) {
    const brand = buf.toString("ascii", 8, 12).toLowerCase()
    if (/^(heic|heix|hevc|hevx|heim|heis|hevm|hevs|mif1|msf1|avif|avis)/.test(brand)) return "heic"
  }
  // JPEG FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "web"
  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "web"
  // GIF
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "web"
  // WEBP: "RIFF"...."WEBP"
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "web"
  // BMP
  if (buf[0] === 0x42 && buf[1] === 0x4d) return "web"
  // TIFF (II* or MM*)
  if ((buf[0] === 0x49 && buf[1] === 0x49 && buf[2] === 0x2a) || (buf[0] === 0x4d && buf[1] === 0x4d && buf[3] === 0x2a))
    return "tiff"
  return "other"
}

/** Convert any sharp-decodable image buffer to a model-viewable JPEG.
 *  sharp is imported lazily so a pass-through JPEG never loads the native addon. */
async function imageToJpeg(buf: Buffer): Promise<Buffer> {
  const { default: sharp } = await import("sharp")
  // `unlimited: true` relaxes libvips/libheif security limits (e.g. the "iref
  // box references exceed 16" error that edited iPhone photos trigger).
  return sharp(buf, { unlimited: true }).rotate().jpeg({ quality: 88 }).toBuffer()
}

/** True when a byte string is dominated by printable/UTF-8 text. */
function looksTextual(text: string): boolean {
  if (!text) return false
  // Count replacement chars (invalid UTF-8) and non-whitespace control chars.
  let bad = 0
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code === 0xfffd) bad++
    else if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) bad++
  }
  return bad / text.length < 0.1
}

/** Compact hex + ASCII preview of the first bytes of a binary blob. */
function hexPreview(buf: Buffer, maxBytes = 2048): string {
  const slice = buf.subarray(0, maxBytes)
  const lines: string[] = []
  for (let off = 0; off < slice.length; off += 16) {
    const row = slice.subarray(off, off + 16)
    const hex = Array.from(row, (b) => b.toString(16).padStart(2, "0")).join(" ")
    const ascii = Array.from(row, (b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : ".")).join("")
    lines.push(`${off.toString(16).padStart(8, "0")}  ${hex.padEnd(47)}  ${ascii}`)
  }
  return lines.join("\n")
}

/**
 * Minimal, brace-aware RTF → plain text. Skips known destination groups
 * (font/color/style tables, \* groups) and decodes \'hh and \uN escapes,
 * honouring the \ucN Unicode fallback skip count so we don't duplicate chars.
 */
function rtfToText(rtf: string): string {
  const IGNORE = new Set([
    "fonttbl", "colortbl", "stylesheet", "info", "pict", "object", "header", "footer",
    "headerl", "headerr", "headerf", "footerl", "footerr", "footerf", "themedata",
    "colorschememapping", "latentstyles", "datastore", "generator", "listtable",
    "listoverridetable", "rsidtbl", "mmathpr", "wgrffmtfilter", "xmlnstbl", "pgptbl",
  ])
  const stack: { ignore: boolean; uc: number }[] = [{ ignore: false, uc: 1 }]
  let out = ""
  let skip = 0 // chars to swallow after a \uN (the ASCII fallback)
  let i = 0
  const n = rtf.length
  const top = () => stack[stack.length - 1]

  while (i < n) {
    const c = rtf[i]
    if (c === "{") {
      const cur = top()
      stack.push({ ignore: cur.ignore, uc: cur.uc })
      i++
    } else if (c === "}") {
      if (stack.length > 1) stack.pop()
      skip = 0
      i++
    } else if (c === "\\") {
      const next = rtf[i + 1]
      if (next === "'") {
        // hex escape \'hh — counts as one char (subject to \uc skip)
        const hex = rtf.substr(i + 2, 2)
        if (skip > 0) skip--
        else if (!top().ignore) out += String.fromCharCode(parseInt(hex, 16) || 0)
        i += 4
      } else if (next && /[A-Za-z]/.test(next)) {
        let j = i + 1
        while (j < n && /[A-Za-z]/.test(rtf[j])) j++
        const word = rtf.slice(i + 1, j)
        let param = ""
        if (rtf[j] === "-") { param += "-"; j++ }
        while (j < n && /\d/.test(rtf[j])) { param += rtf[j]; j++ }
        if (rtf[j] === " ") j++ // one optional delimiting space is consumed
        i = j
        if (word === "u") {
          let code = parseInt(param || "0", 10)
          if (code < 0) code += 65536
          if (!top().ignore) out += String.fromCharCode(code)
          skip = top().uc
        } else if (word === "uc") {
          top().uc = parseInt(param || "1", 10)
        } else if (word === "par" || word === "line" || word === "sect" || word === "row") {
          if (!top().ignore) out += "\n"
        } else if (word === "tab" || word === "cell") {
          if (!top().ignore) out += "\t"
        } else if (word === "*") {
          top().ignore = true
        } else if (IGNORE.has(word.toLowerCase())) {
          top().ignore = true
        }
      } else {
        // control symbol: keep the escaped literal for \\ \{ \}
        if (next === "\\" || next === "{" || next === "}") {
          if (skip > 0) skip--
          else if (!top().ignore) out += next
        }
        i += 2
      }
    } else if (c === "\n" || c === "\r") {
      i++ // raw line breaks in RTF markup are not content
    } else {
      if (skip > 0) skip--
      else if (!top().ignore) out += c
      i++
    }
  }
  return out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
}

/** Wrap extracted text with a short header so the model has provenance. */
function asDocument(name: string, kind: string, text: string): ResolvedUpload {
  const trimmed = text.length > MAX_TEXT_CHARS ? `${text.slice(0, MAX_TEXT_CHARS)}\n\n[Content truncated]` : text
  const body = `[Extracted ${kind} from "${name}"]\n\n${trimmed || "(No readable text content was found.)"}`
  return { body, mediaType: "text/plain", contentType: "text/plain; charset=utf-8" }
}

/**
 * Resolve an uploaded file into a model-ingestible payload. Returns a
 * `ResolveError` for genuinely unsupported types.
 */
export async function resolveUpload(file: File): Promise<ResolvedUpload | ResolveError> {
  const ext = extensionOf(file.name || "")
  const type = (file.type || "").toLowerCase()

  const buffer = Buffer.from(await file.arrayBuffer())

  // 0) IMAGES — decide by the ACTUAL bytes, never the (often wrong on iPhone)
  //    filename. iPhone photos are HEIC and in-app browser webviews frequently
  //    hand over the original HEIC bytes even when the file is named
  //    "IMG_1769.jpeg"; Anthropic can't view HEIC/TIFF/BMP, so we transcode any
  //    non-web image to JPEG here. This is the decisive fix for iPhone uploads.
  const sniff = sniffImage(buffer)
  const looksImage =
    sniff !== "other" ||
    type.startsWith("image/") ||
    ["jpg", "jpeg", "png", "gif", "webp", "tif", "tiff", "heic", "heif", "heic-sequence", "bmp", "avif"].includes(ext)
  if (looksImage) {
    if (sniff === "web") {
      // Genuine web image → tag with the precise type read from the bytes.
      const precise =
        buffer[0] === 0xff && buffer[1] === 0xd8
          ? "image/jpeg"
          : buffer[0] === 0x89 && buffer[1] === 0x50
            ? "image/png"
            : buffer[0] === 0x47 && buffer[1] === 0x49
              ? "image/gif"
              : buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP"
                ? "image/webp"
                : null // e.g. BMP → falls through to conversion
      if (precise && MODEL_VIEWABLE_IMAGE.has(precise)) {
        return { body: buffer, mediaType: precise, contentType: precise }
      }
    }
    // HEIC/HEIF/AVIF/TIFF/BMP/other decodable image → convert to JPEG.
    try {
      const jpeg = await imageToJpeg(buffer)
      return { body: jpeg, mediaType: "image/jpeg", contentType: "image/jpeg" }
    } catch (err) {
      console.log("[v0] image convert failed:", err instanceof Error ? err.message : String(err))
      // iPhone HEIC uses the HEVC codec, which can't be decoded in every runtime
      // (patent-encumbered). Give an actionable, honest message rather than a
      // mystery failure.
      if (sniff === "heic" || ext === "heic" || ext === "heif") {
        return {
          error:
            "This is an iPhone HEIC photo we can't convert here. On your iPhone open Settings → Camera → Formats → 'Most Compatible', retake or re-export the photo as JPG, then upload again. (Or take a screenshot of it and upload the screenshot.)",
        }
      }
      return { error: "Could not read this image. Try exporting it as JPG or PNG, then upload again." }
    }
  }

  // 1) Native non-image pass-through (pdf / text / csv).
  const native = NATIVE[type] || NATIVE_EXT[ext]
  if (
    native &&
    // Guard against octet-stream masquerading: only trust the browser type when
    // it's a real native type, otherwise fall through to extension-based routing.
    !(type === "application/octet-stream" && !NATIVE_EXT[ext])
  ) {
    return { body: buffer, mediaType: native, contentType: file.type || native }
  }

  // 2) DOCX → raw text (mammoth).
  if (ext === "docx" || type.includes("wordprocessingml.document")) {
    try {
      const { default: mammoth } = await import("mammoth")
      const { value } = await mammoth.extractRawText({ buffer })
      return asDocument(file.name, "Word document text", value)
    } catch (err) {
      console.log("[v0] docx extract failed:", err instanceof Error ? err.message : String(err))
      return { error: "Could not read this Word (.docx) file. It may be corrupted." }
    }
  }

  // 3) Legacy DOC → text (word-extractor).
  if (ext === "doc" || type === "application/msword") {
    try {
      const { default: WordExtractor } = await import("word-extractor")
      const doc = await new WordExtractor().extract(buffer)
      const text = [doc.getBody(), doc.getFootnotes(), doc.getHeaders()].filter(Boolean).join("\n\n")
      return asDocument(file.name, "Word document text", text)
    } catch (err) {
      console.log("[v0] doc extract failed:", err instanceof Error ? err.message : String(err))
      return { error: "Could not read this Word (.doc) file. It may be corrupted." }
    }
  }

  // 4) RTF → text.
  if (ext === "rtf" || type === "application/rtf" || type === "text/rtf") {
    try {
      return asDocument(file.name, "rich text", rtfToText(buffer.toString("latin1")))
    } catch (err) {
      console.log("[v0] rtf extract failed:", err instanceof Error ? err.message : String(err))
      return { error: "Could not read this RTF file." }
    }
  }

  // 5) .bin / octet-stream → decode as text when textual, else hex preview.
  if (ext === "bin" || type === "application/octet-stream" || type === "") {
    const text = buffer.toString("utf8")
    if (looksTextual(text)) {
      return asDocument(file.name, "binary file (decoded as text)", text)
    }
    const preview = hexPreview(buffer)
    const summary =
      `Binary file — not decodable as text. Size: ${buffer.length} bytes.\n` +
      `Hex preview of the first ${Math.min(2048, buffer.length)} bytes:\n\n${preview}`
    return asDocument(file.name, "binary file", summary)
  }

  return { error: "Unsupported file type." }
}

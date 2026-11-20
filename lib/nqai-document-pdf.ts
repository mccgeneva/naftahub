// Generates a branded PDF from a document NQAi has authored. The model returns
// a title + Markdown body (via the createDocument tool); this renderer lays it
// out on a consistent grid — section headings, key/value rows, real tables with
// proportional columns and repeating headers, nested lists, inline bold and
// callouts — so every report reads like a professionally typeset document.
//
// Runs in the browser (jsPDF) and is opened through the shared PDF viewer.

import { jsPDF } from "jspdf"
import { BRAND, formatDateTime, makeDocRef, type GeneratedPdf } from "@/lib/pdf-core"
import { BRAND_LABELS, drawBrandMark, pickPdfBrand, type PdfBrand } from "@/lib/pdf-logos"

interface NqaiDocInput {
  title: string
  markdown: string
  /** Signed-in client name, shown on the cover ("Prepared for"). */
  clientName?: string
  /** Which brand mark to stamp. When omitted it is inferred from the content. */
  brand?: PdfBrand
}

type RGB = [number, number, number]
interface Run {
  text: string
  bold: boolean
}

const BODY_SIZE = 10
const BODY_LEADING = 14.5

// jsPDF's standard fonts are Latin-1 only — normalise typographic characters so
// nothing renders as mojibake.
function latin1(text: string): string {
  return text
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201F]/g, '"')
    .replace(/[\u2013]/g, "-")
    .replace(/[\u2014]/g, "—")
    .replace(/[\u2026]/g, "...")
    .replace(/[\u2022\u25CF\u25AA]/g, "-")
    .replace(/[\u2192\u21D2]/g, "->")
    .replace(/[\u2190]/g, "<-")
    .replace(/[\u2264]/g, "<=")
    .replace(/[\u2265]/g, ">=")
    .replace(/[\u00A0\u2009\u202F]/g, " ")
    .replace(/[^\x00-\xFF—]/g, "")
}

// Parse inline Markdown into bold / regular runs; links become "text (url)".
function parseRuns(text: string): Run[] {
  const clean = latin1(text)
    .replace(/`(.+?)`/g, "$1")
    .replace(/\[(.+?)\]\((.+?)\)/g, "$1")
    .replace(/__(.+?)__/g, "**$1**")
  const runs: Run[] = []
  const re = /\*\*(.+?)\*\*/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(clean))) {
    if (m.index > last) runs.push({ text: clean.slice(last, m.index), bold: false })
    runs.push({ text: m[1], bold: true })
    last = m.index + m[0].length
  }
  if (last < clean.length) runs.push({ text: clean.slice(last), bold: false })
  return runs
    .map((r) => ({ ...r, text: r.text.replace(/(^|[^*])\*(?!\s)(.+?)\*/g, "$1$2").replace(/\*/g, "") }))
    .filter((r) => r.text.length > 0)
}

function plain(text: string): string {
  return parseRuns(text)
    .map((r) => r.text)
    .join("")
    .trim()
}

export function generateNqaiDocumentPdf({ title, markdown, clientName, brand }: NqaiDocInput): GeneratedPdf {
  const doc = new jsPDF({ unit: "pt", format: "a4" })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 54
  const contentWidth = pageWidth - margin * 2
  const topStart = 80
  const bottomLimit = pageHeight - 64
  const docRef = makeDocRef("NQAI-DOC")
  const cleanTitle = latin1((title || "NQAi Document").trim())
  const activeBrand: PdfBrand = brand ?? pickPdfBrand(title, markdown)
  const label = BRAND_LABELS[activeBrand]
  const muted: RGB = [110, 114, 122]
  const zebra: RGB = [247, 247, 249]

  let y = topStart
  let sectionNo = 0

  // ---------- page chrome ----------
  const drawContentHeader = () => {
    doc.setFillColor(...BRAND.ink)
    doc.rect(0, 0, pageWidth, 46, "F")
    doc.setFillColor(...BRAND.gold)
    doc.rect(0, 46, pageWidth, 2, "F")
    const markW = drawBrandMark(doc, activeBrand, margin, 11, 58, 24, { panel: true, radius: 4 })
    doc.setTextColor(...BRAND.white)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(9.5)
    doc.text(label.name, margin + markW + 10, 27)
    doc.setTextColor(190, 192, 196)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8)
    const shortTitle = doc.splitTextToSize(cleanTitle, contentWidth * 0.45)[0] as string
    doc.text(shortTitle, pageWidth - margin, 27, { align: "right" })
  }

  const newContentPage = () => {
    doc.addPage()
    drawContentHeader()
    y = topStart
  }

  const ensureSpace = (needed: number) => {
    if (y + needed > bottomLimit) {
      newContentPage()
      return true
    }
    return false
  }

  // ---------- rich text ----------
  // Wrap runs into lines of {text,bold} segments that fit `width`.
  const wrapRuns = (runs: Run[], width: number, size: number): Run[][] => {
    const lines: Run[][] = []
    let line: Run[] = []
    let lineW = 0
    const measure = (t: string, bold: boolean) => {
      doc.setFont("helvetica", bold ? "bold" : "normal")
      doc.setFontSize(size)
      return doc.getTextWidth(t)
    }
    const push = () => {
      if (line.length) {
        const lastSeg = line[line.length - 1]
        lastSeg.text = lastSeg.text.replace(/\s+$/, "")
        lines.push(line)
      }
      line = []
      lineW = 0
    }
    for (const run of runs) {
      const words = run.text.split(/(\s+)/).filter((w) => w.length)
      for (const word of words) {
        if (/^\s+$/.test(word)) {
          if (!line.length) continue
          const w = measure(" ", run.bold)
          line.push({ text: " ", bold: run.bold })
          lineW += w
          continue
        }
        let w = measure(word, run.bold)
        if (lineW + w > width && line.length) push()
        // Hard-break a single word longer than the line.
        if (w > width) {
          let chunk = ""
          for (const ch of word) {
            if (measure(chunk + ch, run.bold) > width) {
              line.push({ text: chunk, bold: run.bold })
              push()
              chunk = ""
            }
            chunk += ch
          }
          w = measure(chunk, run.bold)
          line.push({ text: chunk, bold: run.bold })
          lineW += w
          continue
        }
        line.push({ text: word, bold: run.bold })
        lineW += w
      }
    }
    push()
    return lines.length ? lines : [[{ text: "", bold: false }]]
  }

  const drawRunLine = (line: Run[], x: number, baseline: number, size: number, color: RGB, boldColor?: RGB) => {
    let cx = x
    doc.setFontSize(size)
    for (const seg of line) {
      doc.setFont("helvetica", seg.bold ? "bold" : "normal")
      doc.setTextColor(...(seg.bold && boldColor ? boldColor : color))
      doc.text(seg.text, cx, baseline)
      cx += doc.getTextWidth(seg.text)
    }
  }

  const addRich = (
    text: string,
    opts: { x?: number; width?: number; size?: number; color?: RGB; leading?: number; after?: number; forceBold?: boolean } = {},
  ) => {
    const x = opts.x ?? margin
    const width = opts.width ?? contentWidth
    const size = opts.size ?? BODY_SIZE
    const leading = opts.leading ?? BODY_LEADING
    let runs = parseRuns(text)
    if (opts.forceBold) runs = runs.map((r) => ({ ...r, bold: true }))
    const lines = wrapRuns(runs, width, size)
    for (const ln of lines) {
      ensureSpace(leading)
      drawRunLine(ln, x, y + size * 0.8, size, opts.color ?? BRAND.ink, BRAND.ink)
      y += leading
    }
    y += opts.after ?? 7
  }

  // ---------- blocks ----------
  const addHeading = (text: string, level: number) => {
    const t = plain(text)
    if (level <= 2) {
      sectionNo += 1
      // Keep the heading with at least a few lines of its content.
      ensureSpace(72)
      if (y > topStart + 2) y += 12
      doc.setFillColor(...BRAND.gold)
      doc.rect(margin, y, 3, 18, "F")
      doc.setFont("helvetica", "bold")
      doc.setFontSize(level === 1 ? 14.5 : 13)
      doc.setTextColor(...BRAND.ink)
      const lines = doc.splitTextToSize(t, contentWidth - 14) as string[]
      lines.forEach((ln, i) => {
        if (i > 0) ensureSpace(18)
        doc.text(ln, margin + 12, y + 13)
        y += 18
      })
      y += 4
      doc.setDrawColor(...BRAND.line)
      doc.setLineWidth(0.75)
      doc.line(margin, y, pageWidth - margin, y)
      y += 14
    } else {
      ensureSpace(48)
      y += 6
      doc.setFont("helvetica", "bold")
      doc.setFontSize(level === 3 ? 11 : 10.25)
      doc.setTextColor(...(level === 3 ? BRAND.ink : muted))
      const lines = doc.splitTextToSize(level >= 4 ? t.toUpperCase() : t, contentWidth) as string[]
      lines.forEach((ln) => {
        ensureSpace(15)
        doc.text(ln, margin, y + 10)
        y += 15
      })
      y += 5
    }
  }

  const addBullet = (text: string, depth: number, marker?: string) => {
    const indent = 14 + depth * 16
    const textX = margin + indent + (marker ? 8 : 0)
    const width = contentWidth - (textX - margin)
    const lines = wrapRuns(parseRuns(text), width, BODY_SIZE)
    lines.forEach((ln, i) => {
      ensureSpace(BODY_LEADING)
      if (i === 0) {
        if (marker) {
          doc.setFont("helvetica", "bold")
          doc.setFontSize(BODY_SIZE)
          doc.setTextColor(...BRAND.gold)
          doc.text(marker, margin + indent - 6, y + BODY_SIZE * 0.8)
        } else if (depth === 0) {
          doc.setFillColor(...BRAND.gold)
          doc.circle(margin + indent - 7, y + 4.4, 1.9, "F")
        } else {
          doc.setDrawColor(...BRAND.gold)
          doc.setLineWidth(0.8)
          doc.circle(margin + indent - 7, y + 4.4, 1.7, "S")
        }
      }
      drawRunLine(ln, textX, y + BODY_SIZE * 0.8, BODY_SIZE, BRAND.ink, BRAND.ink)
      y += BODY_LEADING
    })
    y += 3
  }

  // "**Label:** value" lines render as an aligned two-column fact row.
  const addKeyValue = (key: string, value: string) => {
    const keyW = Math.min(170, contentWidth * 0.36)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(9.5)
    const keyLines = doc.splitTextToSize(plain(key), keyW - 10) as string[]
    const valLines = wrapRuns(parseRuns(value), contentWidth - keyW - 10, BODY_SIZE)
    const rows = Math.max(keyLines.length, valLines.length)
    const h = rows * 14 + 10
    ensureSpace(h)
    doc.setDrawColor(...BRAND.line)
    doc.setLineWidth(0.5)
    doc.line(margin, y + h, pageWidth - margin, y + h)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(9.5)
    doc.setTextColor(...muted)
    keyLines.forEach((ln, i) => doc.text(ln, margin, y + 13 + i * 14))
    valLines.forEach((ln, i) => drawRunLine(ln, margin + keyW, y + 13 + i * 14, BODY_SIZE, BRAND.ink, BRAND.ink))
    y += h + 2
  }

  const addCallout = (text: string) => {
    const padX = 14
    const lines = wrapRuns(parseRuns(text), contentWidth - padX * 2, BODY_SIZE)
    const h = lines.length * BODY_LEADING + 16
    ensureSpace(Math.min(h, 120))
    const startY = y
    doc.setFillColor(...zebra)
    doc.rect(margin, startY, contentWidth, h, "F")
    doc.setFillColor(...BRAND.gold)
    doc.rect(margin, startY, 3, h, "F")
    let ly = startY + 10
    lines.forEach((ln) => {
      drawRunLine(ln, margin + padX, ly + BODY_SIZE * 0.8, BODY_SIZE, BRAND.slate, BRAND.ink)
      ly += BODY_LEADING
    })
    y = startY + h + 10
  }

  const addRule = () => {
    ensureSpace(16)
    y += 4
    doc.setDrawColor(...BRAND.line)
    doc.setLineWidth(0.75)
    doc.line(margin, y, pageWidth - margin, y)
    y += 12
  }

  const addTable = (rows: string[][]) => {
    if (!rows.length) return
    const cols = Math.max(...rows.map((r) => r.length))
    const norm = rows.map((r) => Array.from({ length: cols }, (_, i) => plain(r[i] ?? "")))
    const header = norm[0]
    const body = norm.slice(1)
    const cellPad = 6
    const fontSize = cols > 5 ? 8 : 8.75
    const lineH = fontSize + 3.5

    // Proportional column widths from content length, with sensible floors.
    const weights = Array.from({ length: cols }, (_, c) => {
      const longest = Math.max(...norm.map((r) => r[c].length), 3)
      return Math.min(Math.max(longest, 6), 42)
    })
    const totalW = weights.reduce((a, b) => a + b, 0)
    const colW = weights.map((w) => (w / totalW) * contentWidth)
    const numeric = Array.from({ length: cols }, (_, c) =>
      body.length > 0 && body.every((r) => !r[c] || /^[\s$€£%+\-()0-9.,xX/:]+$/.test(r[c]) || /^[A-Z]{3}\s?[\d.,]+/.test(r[c])),
    )

    const measureRow = (cells: string[], bold: boolean) => {
      doc.setFont("helvetica", bold ? "bold" : "normal")
      doc.setFontSize(fontSize)
      const wrapped = cells.map((c, i) => doc.splitTextToSize(c || "—", colW[i] - cellPad * 2) as string[])
      const h = Math.max(...wrapped.map((w) => w.length)) * lineH + cellPad * 2 - 2
      return { wrapped, h }
    }

    const drawRow = (cells: string[], kind: "header" | "body", index: number) => {
      const { wrapped, h } = measureRow(cells, kind === "header")
      if (kind === "header") {
        doc.setFillColor(...BRAND.ink)
        doc.rect(margin, y, contentWidth, h, "F")
      } else if (index % 2 === 1) {
        doc.setFillColor(...zebra)
        doc.rect(margin, y, contentWidth, h, "F")
      }
      let cx = margin
      wrapped.forEach((lines, ci) => {
        doc.setFont("helvetica", kind === "header" ? "bold" : ci === 0 ? "bold" : "normal")
        doc.setFontSize(fontSize)
        doc.setTextColor(...(kind === "header" ? BRAND.white : ci === 0 ? BRAND.ink : BRAND.slate))
        const alignRight = kind === "body" && numeric[ci] && ci > 0
        lines.forEach((ln, li) => {
          const by = y + cellPad + fontSize * 0.8 + li * lineH
          if (alignRight) doc.text(ln, cx + colW[ci] - cellPad, by, { align: "right" })
          else doc.text(ln, cx + cellPad, by)
        })
        cx += colW[ci]
      })
      if (kind === "body") {
        doc.setDrawColor(...BRAND.line)
        doc.setLineWidth(0.5)
        doc.line(margin, y + h, pageWidth - margin, y + h)
      }
      y += h
    }

    const headerH = measureRow(header, true).h
    const firstBodyH = body.length ? measureRow(body[0], false).h : 0
    ensureSpace(headerH + firstBodyH + 4)
    y += 2
    drawRow(header, "header", 0)
    body.forEach((row, i) => {
      const { h } = measureRow(row, false)
      if (y + h > bottomLimit) {
        newContentPage()
        drawRow(header, "header", 0) // repeat header on continuation pages
      }
      drawRow(row, "body", i)
    })
    y += 14
  }

  // ===== Cover =====
  doc.setFillColor(...BRAND.ink)
  doc.rect(0, 0, pageWidth, pageHeight, "F")
  doc.setFillColor(...BRAND.gold)
  doc.rect(0, 0, 6, pageHeight, "F")
  drawBrandMark(doc, activeBrand, margin, 120, 200, 88, { panel: true, radius: 10 })

  doc.setTextColor(...BRAND.white)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(14)
  doc.text(label.name, margin, 246)
  doc.setTextColor(170, 172, 178)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9.5)
  doc.text(label.tagline, margin, 262)
  doc.text(BRAND.address, margin, 276)

  doc.setTextColor(...BRAND.gold)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  doc.text("NQAi  |  INTELLIGENCE REPORT", margin, 360, { charSpace: 1.5 })
  doc.setDrawColor(...BRAND.gold)
  doc.setLineWidth(1.5)
  doc.line(margin, 372, margin + 40, 372)

  doc.setTextColor(...BRAND.white)
  doc.setFont("helvetica", "bold")
  let titleSize = 28
  let titleLines = doc.setFontSize(titleSize).splitTextToSize(cleanTitle, contentWidth) as string[]
  while (titleLines.length > 4 && titleSize > 18) {
    titleSize -= 2
    titleLines = doc.setFontSize(titleSize).splitTextToSize(cleanTitle, contentWidth) as string[]
  }
  let ty = 410
  titleLines.slice(0, 5).forEach((ln) => {
    doc.text(ln, margin, ty)
    ty += titleSize * 1.25
  })

  // Cover meta grid
  const metaTop = pageHeight - 190
  doc.setDrawColor(70, 72, 78)
  doc.setLineWidth(0.75)
  doc.line(margin, metaTop, pageWidth - margin, metaTop)
  const meta: Array<[string, string]> = [
    ["REFERENCE", docRef],
    ["DATE", formatDateTime(new Date())],
    ["PREPARED FOR", clientName || "—"],
  ]
  const metaColW = contentWidth / meta.length
  meta.forEach(([k, v], i) => {
    const mx = margin + i * metaColW
    doc.setFont("helvetica", "bold")
    doc.setFontSize(7.5)
    doc.setTextColor(140, 142, 148)
    doc.text(k, mx, metaTop + 22, { charSpace: 0.8 })
    doc.setFontSize(9.5)
    doc.setTextColor(...BRAND.white)
    const vl = doc.splitTextToSize(latin1(v), metaColW - 12) as string[]
    vl.slice(0, 2).forEach((ln, li) => doc.text(ln, mx, metaTop + 38 + li * 12))
  })
  doc.setFont("helvetica", "normal")
  doc.setTextColor(130, 132, 138)
  doc.setFontSize(7.5)
  const disclaimer = doc.splitTextToSize(
    "Indicative analysis prepared by NQAi. Figures are for information only — confirm firm pricing and terms with the desk before execution.",
    contentWidth,
  ) as string[]
  disclaimer.forEach((ln, i) => doc.text(ln, margin, pageHeight - 76 + i * 10))

  // ===== Body =====
  newContentPage()

  const srcLines = (markdown || "").replace(/\r\n/g, "\n").split("\n")
  // Drop a leading H1 that just repeats the title.
  const firstContent = srcLines.findIndex((l) => l.trim())
  if (firstContent >= 0) {
    const h = /^#\s+(.*)$/.exec(srcLines[firstContent].trim())
    if (h && plain(h[1]).toLowerCase() === cleanTitle.toLowerCase()) srcLines.splice(firstContent, 1)
  }

  let tableBuffer: string[][] = []
  let paraBuffer: string[] = []
  const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l)
  const isTableDivider = (l: string) => /^\s*\|?[\s:|-]+\|?\s*$/.test(l) && l.includes("-")

  const flushTable = () => {
    if (tableBuffer.length) addTable(tableBuffer)
    tableBuffer = []
  }
  const flushPara = () => {
    if (paraBuffer.length) addRich(paraBuffer.join(" "), { after: 8 })
    paraBuffer = []
  }

  for (const raw of srcLines) {
    const line = raw.replace(/\t/g, "    ").trimEnd()

    if (isTableRow(line)) {
      flushPara()
      if (isTableDivider(line)) continue
      tableBuffer.push(
        line
          .replace(/^\s*\|/, "")
          .replace(/\|\s*$/, "")
          .split("|")
          .map((c) => c.trim()),
      )
      continue
    }
    flushTable()

    const trimmed = line.trim()
    if (!trimmed) {
      flushPara()
      continue
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed)
    if (heading) {
      flushPara()
      addHeading(heading[2], heading[1].length)
      continue
    }

    const leadSpaces = line.length - line.trimStart().length
    const depth = Math.min(3, Math.floor(leadSpaces / 2))

    const bullet = /^[-*+]\s+(.*)$/.exec(trimmed)
    if (bullet) {
      flushPara()
      const kv = /^\*\*(.+?):?\*\*:?\s+(.+)$/.exec(bullet[1])
      if (kv && depth === 0 && kv[1].length < 40) addKeyValue(kv[1], kv[2])
      else addBullet(bullet[1], depth)
      continue
    }

    const ordered = /^(\d+)[.)]\s+(.*)$/.exec(trimmed)
    if (ordered) {
      flushPara()
      addBullet(ordered[2], depth, `${ordered[1]}.`)
      continue
    }

    if (/^(-{3,}|_{3,}|\*{3,})$/.test(trimmed)) {
      flushPara()
      addRule()
      continue
    }

    const quote = /^>\s?(.*)$/.exec(trimmed)
    if (quote) {
      flushPara()
      addCallout(quote[1])
      continue
    }

    // Standalone "**Label:** value" line → fact row.
    const kv = /^\*\*(.+?):\*\*\s*(.+)$/.exec(trimmed) ?? /^\*\*(.+?)\*\*:\s*(.+)$/.exec(trimmed)
    if (kv && kv[1].length < 40) {
      flushPara()
      addKeyValue(kv[1], kv[2])
      continue
    }

    // A whole bold line acts as a sub-heading.
    if (/^\*\*[^*]+\*\*:?$/.test(trimmed)) {
      flushPara()
      addHeading(trimmed.replace(/:$/, ""), 3)
      continue
    }

    paraBuffer.push(trimmed)
  }
  flushPara()
  flushTable()

  // ===== Footers (page X of Y) on every content page =====
  const total = doc.getNumberOfPages()
  for (let p = 2; p <= total; p++) {
    doc.setPage(p)
    doc.setDrawColor(...BRAND.line)
    doc.setLineWidth(0.75)
    doc.line(margin, pageHeight - 44, pageWidth - margin, pageHeight - 44)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(7.5)
    doc.setTextColor(...muted)
    doc.text(`${label.name}  ·  Prepared by NQAi  ·  ${docRef}`, margin, pageHeight - 30)
    doc.text(`Page ${p - 1} of ${total - 1}`, pageWidth - margin, pageHeight - 30, { align: "right" })
  }
  void sectionNo

  const safeFile = cleanTitle.replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "-").slice(0, 60) || "NQAi-Document"
  return { doc, filename: `${safeFile}.pdf`, title: cleanTitle }
}

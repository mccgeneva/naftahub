import { jsPDF } from "jspdf"
import type { GeneratedPdf } from "@/lib/pdf-core"
import { SIMULATION_DISCLAIMER, type SwiftSimulationRecord } from "@/lib/swift-simulation"

// Deliberately a plain training worksheet (not a bank/FIN printout): no logos,
// no letterhead, a red banner top+bottom and a diagonal watermark on EVERY page.
// There is no option to render without the markings.

const RED: [number, number, number] = [185, 28, 28]
const WATERMARK: [number, number, number] = [250, 205, 205]

function watermark(doc: jsPDF) {
  const w = doc.internal.pageSize.getWidth()
  const h = doc.internal.pageSize.getHeight()
  doc.setTextColor(...WATERMARK)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(54)
  for (let y = 180; y < h + 100; y += 230) {
    doc.text("SIMULATION", w / 2, y, { align: "center", angle: 35 })
  }
}

function banners(doc: jsPDF, docId: string, page: number, total: number) {
  const w = doc.internal.pageSize.getWidth()
  const h = doc.internal.pageSize.getHeight()
  doc.setFillColor(...RED)
  doc.rect(0, 0, w, 34, "F")
  doc.rect(0, h - 34, w, 34, "F")
  doc.setTextColor(255, 255, 255)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.text(SIMULATION_DISCLAIMER, w / 2, 21, { align: "center", maxWidth: w - 40 })
  doc.setFontSize(8)
  doc.text(`${SIMULATION_DISCLAIMER}  ·  ${docId}  ·  Page ${page}/${total}`, w / 2, h - 14, {
    align: "center",
    maxWidth: w - 40,
  })
}

export function generateSwiftSimulationPdf(record: SwiftSimulationRecord): GeneratedPdf {
  const doc = new jsPDF({ unit: "pt", format: "a4" })
  const w = doc.internal.pageSize.getWidth()
  const h = doc.internal.pageSize.getHeight()
  const margin = 44
  watermark(doc)

  let y = 64
  doc.setTextColor(30, 30, 30)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(16)
  doc.text("Training worksheet — MT103-style payment simulation", margin, y)
  y += 18
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(90, 90, 90)
  doc.text(
    `Simulation ID ${record.id} · generated ${new Date(record.createdAt).toUTCString()} · by ${record.createdBy}`,
    margin,
    y,
  )
  y += 14
  doc.text(
    "All bank identifiers and account numbers below are fictitious placeholders. This worksheet has no legal or payment value.",
    margin,
    y,
    { maxWidth: w - margin * 2 },
  )
  y += 26

  const colTag = margin
  const colMeaning = margin + 60
  const colValue = margin + 210
  const valueWidth = w - margin - colValue

  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.setTextColor(30, 30, 30)
  doc.text("Field", colTag, y)
  doc.text("Meaning", colMeaning, y)
  doc.text("Simulated value", colValue, y)
  y += 6
  doc.setDrawColor(200, 200, 200)
  doc.line(margin, y, w - margin, y)
  y += 14

  for (const f of record.fields) {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(10)
    const lines = doc.splitTextToSize(f.value, valueWidth) as string[]
    const rowH = Math.max(lines.length * 13, 13) + 8
    if (y + rowH > h - 60) {
      doc.addPage()
      watermark(doc)
      y = 64
    }
    doc.setTextColor(30, 30, 30)
    doc.setFont("helvetica", "bold")
    doc.text(f.tag, colTag, y)
    doc.setFont("helvetica", "normal")
    doc.setTextColor(90, 90, 90)
    doc.text(doc.splitTextToSize(f.meaning, 140) as string[], colMeaning, y)
    doc.setTextColor(30, 30, 30)
    doc.text(lines, colValue, y)
    y += rowH
    doc.line(margin, y - 8, w - margin, y - 8)
  }

  const total = doc.getNumberOfPages()
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    banners(doc, record.id, p, total)
  }

  return {
    doc,
    filename: `SIMULATION-TRAINING-${record.id}.pdf`,
    title: `Simulation ${record.id}`,
  }
}

// Shared helpers for exporting tabular data to CSV and importing CSV files.
// Runs entirely in the browser — triggers a real file download / file picker.

type Row = Record<string, unknown>

function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return ""
  const str = String(value)
  // Quote values containing commas, quotes, or newlines; escape inner quotes.
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/**
 * Convert an array of objects to CSV text. Column order follows the keys of the
 * first row unless `columns` is provided.
 */
export function toCsv(rows: Row[], columns?: { key: string; label?: string }[]): string {
  if (rows.length === 0 && !columns) return ""

  const cols =
    columns ??
    Object.keys(rows[0] ?? {}).map((key) => ({ key, label: key }))

  const header = cols.map((c) => escapeCsvValue(c.label ?? c.key)).join(",")
  const body = rows
    .map((row) => cols.map((c) => escapeCsvValue(row[c.key])).join(","))
    .join("\r\n")

  return body ? `${header}\r\n${body}` : header
}

/**
 * Download arbitrary text content as a file in the browser.
 */
export function downloadFile(filename: string, content: string, mimeType = "text/csv;charset=utf-8;") {
  if (typeof window === "undefined") return
  // Prepend BOM so Excel opens UTF-8 correctly.
  const blob = new Blob(["\uFEFF", content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  // Defer revoke so the download has time to start.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Export rows to a timestamped CSV file and trigger the download.
 */
export function exportToCsv(
  baseName: string,
  rows: Row[],
  columns?: { key: string; label?: string }[],
) {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")
  const csv = toCsv(rows, columns)
  downloadFile(`${baseName}-${stamp}.csv`, csv)
  return rows.length
}

/**
 * Open the OS file picker for a CSV file and parse it into an array of objects
 * keyed by the header row. Resolves to an empty array if the user cancels.
 */
export function importCsvFile(): Promise<Row[]> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      resolve([])
      return
    }
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".csv,text/csv"
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) {
        resolve([])
        return
      }
      const reader = new FileReader()
      reader.onload = () => {
        try {
          resolve(parseCsv(String(reader.result ?? "")))
        } catch (err) {
          reject(err)
        }
      }
      reader.onerror = () => reject(reader.error)
      reader.readAsText(file)
    }
    input.click()
  })
}

/**
 * Minimal CSV parser supporting quoted fields, escaped quotes, and CRLF/LF.
 */
export function parseCsv(text: string): Row[] {
  const rows: string[][] = []
  let field = ""
  let record: string[] = []
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
    } else if (char === '"') {
      inQuotes = true
    } else if (char === ",") {
      record.push(field)
      field = ""
    } else if (char === "\n" || char === "\r") {
      // Handle CRLF as a single line break.
      if (char === "\r" && text[i + 1] === "\n") i++
      record.push(field)
      field = ""
      if (record.some((c) => c.trim() !== "")) rows.push(record)
      record = []
    } else {
      field += char
    }
  }
  // Flush trailing field/record.
  if (field !== "" || record.length > 0) {
    record.push(field)
    if (record.some((c) => c.trim() !== "")) rows.push(record)
  }

  if (rows.length === 0) return []
  const headers = rows[0].map((h) => h.trim())
  return rows.slice(1).map((cols) => {
    const obj: Row = {}
    headers.forEach((h, idx) => {
      obj[h] = cols[idx] ?? ""
    })
    return obj
  })
}

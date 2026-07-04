// CSV parsing helpers for the historical-spreadsheet import wizard (SPEC §3.6). A small
// hand-rolled parser rather than a library — the source format is the owner's own fixed
// spreadsheet export, and this keeps the app dependency-free for a narrow, personal need.

/** Parse CSV text (handles double-quoted fields, escaped "" quotes, and commas inside quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  function endField() {
    row.push(field)
    field = ''
  }
  function endRow() {
    endField()
    rows.push(row)
    row = []
  }

  while (i < text.length) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += ch
      i++
      continue
    }
    if (ch === '"') {
      inQuotes = true
      i++
      continue
    }
    if (ch === ',') {
      endField()
      i++
      continue
    }
    if (ch === '\r') {
      i++
      continue
    }
    if (ch === '\n') {
      endRow()
      i++
      continue
    }
    field += ch
    i++
  }
  // Final field/row, only if there's trailing content (avoids a phantom empty last row).
  if (field.length > 0 || row.length > 0) endRow()

  return rows.filter((r) => !(r.length === 1 && r[0] === ''))
}

/** Parse a header row + data rows into row objects keyed by header. */
export function csvToRecords(rows: string[][]): { headers: string[]; records: Record<string, string>[] } {
  if (rows.length === 0) return { headers: [], records: [] }
  const [headers, ...dataRows] = rows
  const records = dataRows.map((r) => {
    const rec: Record<string, string> = {}
    headers.forEach((h, i) => (rec[h] = r[i] ?? ''))
    return rec
  })
  return { headers, records }
}

/**
 * Parse a time string to seconds. Accepts plain seconds ("246.793"), mm:ss ("4:06.793"),
 * or h:mm:ss — whichever the source spreadsheet uses for finish/lap times.
 */
export function parseTimeToSeconds(raw: string): number | null {
  const s = raw.trim()
  if (s === '') return null
  if (/^\d+(\.\d+)?$/.test(s)) return Number.parseFloat(s)
  const parts = s.split(':').map((p) => Number.parseFloat(p))
  if (parts.length < 2 || parts.some((p) => Number.isNaN(p))) return null
  let seconds = 0
  for (const p of parts) seconds = seconds * 60 + p
  return seconds
}

/** Parse a "65x15" / "65-15" / "65/15" gear string into {chainring, cog}. */
export function parseGear(raw: string): { chainring: number; cog: number } | null {
  const match = raw.trim().match(/^(\d+)\s*[x×\-/]\s*(\d+)$/i)
  if (!match) return null
  return { chainring: Number.parseInt(match[1], 10), cog: Number.parseInt(match[2], 10) }
}

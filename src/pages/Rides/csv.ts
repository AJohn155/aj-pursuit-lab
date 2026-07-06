// CSV parsing helpers for the historical-spreadsheet import wizard (SPEC §3.6). A small
// hand-rolled parser rather than a library — the source format is the owner's own fixed
// spreadsheet export, and this keeps the app dependency-free for a narrow, personal need.

/**
 * Parse CSV/TSV text. The delimiter is auto-detected: a tab anywhere in the text means a
 * spreadsheet paste (Google Sheets/Excel copy out tab-separated), otherwise comma.
 *
 * The two formats get DIFFERENT quote handling on purpose. Comma CSV uses strict
 * RFC-style quoting (quoted fields may contain commas/newlines). Tab pastes use lenient
 * quoting: rows always split on newlines and cells on tabs, and quotes are just stripped
 * when they wrap a cell (or dangle at a row's edge). Strict quoting on a TSV paste is
 * what silently swallowed the owner's entire data row into one field when the paste
 * carried a stray wrapping quote (2026-07) — in a spreadsheet paste, structure comes from
 * tabs/newlines, never from quotes.
 */
export function parseCsv(text: string): string[][] {
  return text.includes('\t') ? parseTsv(text) : parseStrictCsv(text)
}

function parseTsv(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const cells = line.split('\t').map((cell) => {
        if (cell.length >= 2 && cell.startsWith('"') && cell.endsWith('"')) {
          return cell.slice(1, -1).replaceAll('""', '"')
        }
        return cell
      })
      // A row that was wrapped in quotes as a whole leaves one dangling quote at each
      // end — strip those too.
      if (cells.length > 1) {
        if (cells[0].startsWith('"') && !cells[0].endsWith('"')) cells[0] = cells[0].slice(1)
        const last = cells[cells.length - 1]
        if (last.endsWith('"') && !last.startsWith('"')) cells[cells.length - 1] = last.slice(0, -1)
      }
      return cells
    })
}

function parseStrictCsv(text: string): string[][] {
  const delim = ','
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
    if (ch === delim) {
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

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

/**
 * Normalize a spreadsheet date cell to ISO YYYY-MM-DD (owner request 2026-07 item 11:
 * auto-detect the date). Accepts ISO, US M/D/YYYY (and M/D/YY), "24 Oct 2025",
 * "Oct 24, 2025". Returns null when unrecognizable — the import reports it rather than
 * guessing.
 */
export function normalizeDateString(raw: string): string | null {
  const s = raw.trim()
  if (s === '') return null

  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`

  // US M/D/YYYY — the owner's sheets are US-locale (LA-based).
  const us = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})$/)
  if (us) {
    const year = us[3].length === 2 ? `20${us[3]}` : us[3]
    return `${year}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`
  }

  // "24 Oct 2025", "24-Oct-25" (the owner's sheet uses the dashed 2-digit-year form).
  const dmy = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3,})\.?,?[-\s](\d{2,4})$/)
  if (dmy) {
    const m = MONTHS[dmy[2].slice(0, 3).toLowerCase()]
    const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]
    if (m) return `${year}-${String(m).padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  }
  const mdy = s.match(/^([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})$/)
  if (mdy) {
    const m = MONTHS[mdy[1].slice(0, 3).toLowerCase()]
    if (m) return `${mdy[3]}-${String(m).padStart(2, '0')}-${mdy[2].padStart(2, '0')}`
  }
  return null
}

/** The owner's history-sheet header layout (request 2026-07 item 1), auto-detected. */
export interface OwnerSheetMapping {
  event: string
  date: string
  location: string
  airDensity: string
  gearing: string
  overallTime: string
  avgPower: string
  notes: string
  lapCols: string[]
}

/**
 * Recognizes the owner's history-table paste by its distinctive headers (Event / Date /
 * Location / Air density / Gearing / Overall time / … / Lap 1..Lap 16 / Comments) and
 * returns a ready-made column mapping, or null if this isn't that layout. Matching is
 * case-insensitive and tolerant of the sheet's trailing colons/blank spacer columns.
 */
export function detectOwnerSheet(headers: string[]): OwnerSheetMapping | null {
  const find = (pred: (h: string) => boolean) => headers.find((h) => pred(h.trim().toLowerCase()))
  const event = find((h) => h === 'event')
  const date = find((h) => h === 'date')
  const overallTime = find((h) => h === 'overall time')
  const lapCols = headers
    .filter((h) => /^lap\s*\d+$/i.test(h.trim()))
    .sort((a, b) => Number(a.replace(/\D+/g, '')) - Number(b.replace(/\D+/g, '')))
  if (!event || !date || !overallTime || lapCols.length < 2) return null
  return {
    event,
    date,
    location: find((h) => h === 'location') ?? '',
    airDensity: find((h) => h.startsWith('air density')) ?? '',
    gearing: find((h) => h === 'gearing' || h === 'gear') ?? '',
    overallTime,
    avgPower: find((h) => h === 'avg power') ?? '',
    notes: find((h) => h.startsWith('comments') || h.startsWith('notes')) ?? '',
    lapCols,
  }
}

/** Case-insensitive venue match: exact name first, then contains in either direction
 * ("Santiago" ↔ "Peñalolén (Santiago)"), then the same per comma-separated part so
 * "Santiago, CH" still lands on "Peñalolén (Santiago)". */
export function matchVenueName<T extends { name: string }>(name: string, venues: T[]): T | undefined {
  const candidates = [name, ...name.split(',')].map((s) => s.trim().toLowerCase()).filter((s) => s.length >= 3)
  for (const n of candidates) {
    const hit =
      venues.find((v) => v.name.toLowerCase() === n) ??
      venues.find((v) => v.name.toLowerCase().includes(n) || n.includes(v.name.toLowerCase()))
    if (hit) return hit
  }
  return undefined
}

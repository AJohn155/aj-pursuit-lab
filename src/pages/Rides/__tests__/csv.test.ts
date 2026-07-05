import { describe, expect, it } from 'vitest'
import { csvToRecords, parseCsv, parseGear, parseTimeToSeconds } from '../csv'

describe('parseCsv (SPEC §3.6)', () => {
  it('parses a simple comma-separated grid', () => {
    const rows = parseCsv('date,venue,time\n2025-10-24,Peñalolén,246.793\n')
    expect(rows).toEqual([
      ['date', 'venue', 'time'],
      ['2025-10-24', 'Peñalolén', '246.793'],
    ])
  })

  it('handles quoted fields containing commas', () => {
    const rows = parseCsv('notes,time\n"suit, new socks",246.793\n')
    expect(rows[1]).toEqual(['suit, new socks', '246.793'])
  })

  it('handles escaped double quotes inside quoted fields', () => {
    const rows = parseCsv('notes\n"the ""fast"" suit"\n')
    expect(rows[1]).toEqual(['the "fast" suit'])
  })

  it('handles a file with no trailing newline', () => {
    const rows = parseCsv('a,b\n1,2')
    expect(rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('handles CRLF line endings', () => {
    const rows = parseCsv('a,b\r\n1,2\r\n')
    expect(rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })
})

describe('csvToRecords', () => {
  it('keys each row object by the header row', () => {
    const { headers, records } = csvToRecords([
      ['date', 'venue'],
      ['2025-10-24', 'Peñalolén'],
      ['2025-10-25', 'Ballerup'],
    ])
    expect(headers).toEqual(['date', 'venue'])
    expect(records).toEqual([
      { date: '2025-10-24', venue: 'Peñalolén' },
      { date: '2025-10-25', venue: 'Ballerup' },
    ])
  })

  it('returns empty output for empty input', () => {
    expect(csvToRecords([])).toEqual({ headers: [], records: [] })
  })
})

describe('parseTimeToSeconds (SPEC §3.6 finish/lap time formats)', () => {
  it('parses plain seconds', () => {
    expect(parseTimeToSeconds('246.793')).toBeCloseTo(246.793, 6)
  })
  it('parses mm:ss.sss', () => {
    expect(parseTimeToSeconds('4:06.793')).toBeCloseTo(246.793, 6)
  })
  it('parses h:mm:ss', () => {
    expect(parseTimeToSeconds('1:00:00')).toBeCloseTo(3600, 6)
  })
  it('returns null for empty or unparseable input', () => {
    expect(parseTimeToSeconds('')).toBeNull()
    expect(parseTimeToSeconds('  ')).toBeNull()
    expect(parseTimeToSeconds('not a time')).toBeNull()
  })
})

describe('parseGear', () => {
  it('parses common gear notations', () => {
    expect(parseGear('65x15')).toEqual({ chainring: 65, cog: 15 })
    expect(parseGear('65X15')).toEqual({ chainring: 65, cog: 15 })
    expect(parseGear('65-15')).toEqual({ chainring: 65, cog: 15 })
    expect(parseGear('65/15')).toEqual({ chainring: 65, cog: 15 })
    expect(parseGear('60 x 14')).toEqual({ chainring: 60, cog: 14 })
  })
  it('returns null for unrecognized text', () => {
    expect(parseGear('unknown')).toBeNull()
    expect(parseGear('')).toBeNull()
  })
})

// --- Owner-sheet paste support (2026-07 items 1/11) -------------------------------------

import { detectOwnerSheet, matchVenueName, normalizeDateString } from '../csv'
import { parseSplitsText } from '../splits'

const OWNER_HEADER =
  'Event\tDate\tLocation\tAir density\tGearing\tOverall time\tStart Lap\tAvg non-start lap split\tAvg Power\tAvg Start Power (10 sec)\tAvg non-start Power\t1st kilo\t2nd kilo\t3rd kilo\t4th kilo\t\t2km split\t3km split\t\t' +
  Array.from({ length: 16 }, (_, i) => `Lap ${i + 1}`).join('\t') +
  '\t\tAdjusted Density\tAdjusted Time\t\tComments/Notes:'

describe('owner history-sheet paste (2026-07 item 1)', () => {
  it('parses tab-separated pastes', () => {
    const rows = parseCsv('a\tb\n1\t2')
    expect(rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('detects the owner header layout and maps every needed column', () => {
    const { headers } = csvToRecords(parseCsv(OWNER_HEADER + '\n' + 'x'.repeat(0)))
    const m = detectOwnerSheet(headers)
    expect(m).not.toBeNull()
    expect(m!.event).toBe('Event')
    expect(m!.date).toBe('Date')
    expect(m!.location).toBe('Location')
    expect(m!.airDensity).toBe('Air density')
    expect(m!.gearing).toBe('Gearing')
    expect(m!.overallTime).toBe('Overall time')
    expect(m!.avgPower).toBe('Avg Power')
    expect(m!.notes).toBe('Comments/Notes:')
    expect(m!.lapCols).toEqual(Array.from({ length: 16 }, (_, i) => `Lap ${i + 1}`))
  })

  it('does not fire on a generic CSV', () => {
    expect(detectOwnerSheet(['date', 'venue', 'time'])).toBeNull()
  })
})

describe('normalizeDateString (2026-07 item 11)', () => {
  it('passes through ISO and pads', () => {
    expect(normalizeDateString('2025-10-24')).toBe('2025-10-24')
    expect(normalizeDateString('2025-3-4')).toBe('2025-03-04')
  })
  it('parses US M/D/YYYY and M/D/YY', () => {
    expect(normalizeDateString('10/24/2025')).toBe('2025-10-24')
    expect(normalizeDateString('3/4/25')).toBe('2025-03-04')
  })
  it('parses month-name forms', () => {
    expect(normalizeDateString('24 Oct 2025')).toBe('2025-10-24')
    expect(normalizeDateString('Oct 24, 2025')).toBe('2025-10-24')
  })
  it('rejects garbage', () => {
    expect(normalizeDateString('sometime last year')).toBeNull()
  })
})

describe('matchVenueName', () => {
  const venues = [{ name: 'Peñalolén (Santiago)' }, { name: 'Ballerup Super Arena' }]
  it('matches exact, case-insensitive', () => {
    expect(matchVenueName('ballerup super arena', venues)?.name).toBe('Ballerup Super Arena')
  })
  it('matches contains in either direction', () => {
    expect(matchVenueName('Santiago', venues)?.name).toBe('Peñalolén (Santiago)')
    expect(matchVenueName('Peñalolén (Santiago) velodrome', venues)?.name).toBe('Peñalolén (Santiago)')
    expect(matchVenueName('Ballerup', venues)?.name).toBe('Ballerup Super Arena')
  })
})

describe('parseSplitsText (2026-07 item 16)', () => {
  it('parses per-lap splits with mixed separators', () => {
    const r = parseSplitsText('19.6, 14.4 14.5\n14.6')
    expect(r.error).toBeNull()
    expect(r.splits).toEqual([19.6, 14.4, 14.5, 14.6])
  })
  it('detects cumulative splits and converts to per-lap', () => {
    const r = parseSplitsText('19.6 34.0 48.5 63.1')
    expect(r.error).toBeNull()
    expect(r.splits.map((s) => Number(s.toFixed(3)))).toEqual([19.6, 14.4, 14.5, 14.6])
  })
  it('flags nonsense values', () => {
    expect(parseSplitsText('19.6 999').error).not.toBeNull()
    expect(parseSplitsText('abc').error).not.toBeNull()
  })
  it('empty text is fine (splits optional)', () => {
    expect(parseSplitsText('  ')).toEqual({ splits: [], error: null })
  })
})

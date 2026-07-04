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

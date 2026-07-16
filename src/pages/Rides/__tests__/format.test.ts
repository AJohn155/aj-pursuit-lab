import { describe, expect, it } from 'vitest'
import { formatRaceTime } from '../format'

describe('formatRaceTime (owner request 2026-07 round 12)', () => {
  it('formats a pursuit time as m:ss.mmm', () => {
    expect(formatRaceTime(246.793)).toBe('4:06.793')
    expect(formatRaceTime(248.699)).toBe('4:08.699')
  })

  it('keeps the leading 0: and zero-pads seconds under a minute', () => {
    expect(formatRaceTime(45.1)).toBe('0:45.100')
    expect(formatRaceTime(6.793)).toBe('0:06.793')
  })

  it('handles exact minutes and negatives, and guards non-finite', () => {
    expect(formatRaceTime(120)).toBe('2:00.000')
    expect(formatRaceTime(-1.906)).toBe('-0:01.906')
    expect(formatRaceTime(Number.NaN)).toBe('—')
  })
})

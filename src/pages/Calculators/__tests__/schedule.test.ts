import { describe, expect, it } from 'vitest'
import { buildSchedule, formatMinSec, scheduleFromFirstAndSettle } from '../schedule'

describe('Schedule Builder math (owner item 17, 2026-07 — sheet port)', () => {
  it("reproduces the sheet's generated-schedule example: first 21.5 + subsequent 14.9", () => {
    // Owner's sheet, Cadence Calculator rows 51–66: 21.5 start + 14.9 laps →
    // 1k 66.2, 2k cum 125.8, total 245.0; km splits 59.6 after the first.
    const rows = buildSchedule(scheduleFromFirstAndSettle(21.5, 14.9))
    expect(rows).toHaveLength(16)
    expect(rows[3].cumTimeS).toBeCloseTo(66.2, 6)
    expect(rows[3].kmSplitS).toBeCloseTo(66.2, 6)
    expect(rows[7].cumTimeS).toBeCloseTo(125.8, 6)
    expect(rows[7].kmSplitS).toBeCloseTo(59.6, 6)
    expect(rows[15].cumTimeS).toBeCloseTo(245.0, 6)
    expect(rows[15].kmSplitS).toBeCloseTo(59.6, 6)
  })

  it("reproduces the sheet's manual per-lap example (rows 51–66 left block)", () => {
    // 20.6, 14.2, 14.1, then 14.2×9, then 14.3, 14.3, 14.4, 14.4 → total 234.1,
    // km splits 63.1 / 56.8 / 56.8 / 57.4.
    const lapTimes = [20.6, 14.2, 14.1, 14.2, 14.2, 14.2, 14.2, 14.2, 14.2, 14.2, 14.2, 14.2, 14.3, 14.3, 14.4, 14.4]
    const rows = buildSchedule(lapTimes)
    expect(rows[3].kmSplitS).toBeCloseTo(63.1, 6)
    expect(rows[7].kmSplitS).toBeCloseTo(56.8, 6)
    expect(rows[11].kmSplitS).toBeCloseTo(56.8, 6)
    expect(rows[15].kmSplitS).toBeCloseTo(57.4, 6)
    expect(rows[15].cumTimeS).toBeCloseTo(234.1, 6)
    // Off-boundary rows carry no km split.
    expect(rows[0].kmSplitS).toBeNull()
    expect(rows[4].kmSplitS).toBeNull()
  })

  it('formatMinSec renders m:ss.t', () => {
    expect(formatMinSec(245.0)).toBe('4:05.0')
    expect(formatMinSec(66.2)).toBe('1:06.2')
    expect(formatMinSec(59.96, 1)).toBe('1:00.0')
  })
})

import { describe, expect, it } from 'vitest'
import { gapCharts, speedPositionAverage, timeAtDistance } from '../compare'
import type { DistanceTimeSeries } from '../compare'

describe('timeAtDistance', () => {
  const series: DistanceTimeSeries = { distM: [0, 100, 200, 300], elapsedS: [0, 10, 25, 45] }

  it('interpolates linearly between samples', () => {
    expect(timeAtDistance(series, 50)).toBeCloseTo(5, 6)
    expect(timeAtDistance(series, 150)).toBeCloseTo(17.5, 6)
  })

  it('clamps below the first sample and above the last', () => {
    expect(timeAtDistance(series, -10)).toBe(0)
    expect(timeAtDistance(series, 1000)).toBe(45)
  })
})

describe('gapCharts', () => {
  it('is zero everywhere for the reference ride itself', () => {
    const a: DistanceTimeSeries = { distM: [0, 4000], elapsedS: [0, 240] }
    const b: DistanceTimeSeries = { distM: [0, 4000], elapsedS: [0, 246] }
    const [refGap, otherGap] = gapCharts([a, b])
    expect(refGap.gapS.every((g) => g === 0)).toBe(true)
    // constant-speed rides both ends → uniform, linearly growing gap
    expect(otherGap.gapS[0]).toBeCloseTo(0, 6)
    expect(otherGap.gapS[otherGap.gapS.length - 1]).toBeCloseTo(6, 6)
    expect(otherGap.gapS[Math.floor(otherGap.gapS.length / 2)]).toBeGreaterThan(0)
  })

  it('returns an empty array for no rides', () => {
    expect(gapCharts([])).toEqual([])
  })
})

describe('speedPositionAverage', () => {
  it('averages steady-lap points into position bins, skipping out-of-range laps', () => {
    const overlay = [
      { lap: 1, posM: [10], speedMs: [999] }, // excluded (before firstLap=3)
      { lap: 3, posM: [10, 240], speedMs: [16, 18] },
      { lap: 4, posM: [10, 240], speedMs: [14, 20] },
      { lap: 16, posM: [10], speedMs: [999] }, // excluded (after lastLap=15)
    ]
    const { posM, speedMs } = speedPositionAverage(overlay, 250, 15)
    expect(posM.length).toBe(speedMs.length)
    // bin near position 10: average of 16 and 14
    const nearStart = speedMs[posM.findIndex((p) => p < 20)]
    expect(nearStart).toBeCloseTo(15, 6)
    expect(speedMs.every((v) => v !== 999)).toBe(true)
  })
})

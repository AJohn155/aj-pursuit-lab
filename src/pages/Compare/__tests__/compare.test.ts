import { describe, expect, it } from 'vitest'
import { buildDistanceTimeSeries, gapCharts, speedPositionAverage, timeAtDistance } from '../compare'
import type { DistanceTimeSeries } from '../compare'
import { linearTrend, rSquared } from '../../Rides/RideDetail/trend'

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

describe('official-split anchoring (owner request 2026-07)', () => {
  // A synthetic reconstructed series: 4 laps of 250 m ridden at a constant reconstructed
  // 15.0 s/lap, but with OFFICIAL splits that differ (the reconstruction carries the
  // start-anchor error; officials are ground truth at the lap lines).
  function syntheticFull(elapsedPerLapS: number) {
    const t: number[] = []
    const d: number[] = []
    const n = Math.ceil(4 * elapsedPerLapS)
    const speed = 250 / elapsedPerLapS
    for (let s = 0; s <= n; s++) {
      t.push(s)
      d.push(s * speed)
    }
    return {
      base: {
        timeline: { t, d },
        laps: { calibrationInterior: 1, d0: 0, lapBoundaryTimes: [0, n] },
        detection: { t0: 0 },
      },
    } as never
  }

  it('elapsed time at every lap line equals the official cumulative split', () => {
    const officialSplits = [21.0, 14.5, 14.8, 14.7]
    const series = buildDistanceTimeSeries(syntheticFull(15), { officialSplits, lapLengthM: 250 })
    let cum = 0
    for (let lap = 1; lap <= 4; lap++) {
      cum += officialSplits[lap - 1]
      expect(timeAtDistance(series, lap * 250)).toBeCloseTo(cum, 2)
    }
    // Within-lap times stay monotonic.
    for (let i = 1; i < series.elapsedS.length; i++) {
      expect(series.elapsedS[i]).toBeGreaterThan(series.elapsedS[i - 1])
    }
  })

  it('without splits the series is unchanged', () => {
    const plain = buildDistanceTimeSeries(syntheticFull(15))
    expect(timeAtDistance(plain, 1000)).toBeCloseTo(60, 1)
  })

  it('nonsense splits are ignored rather than corrupting the series', () => {
    const series = buildDistanceTimeSeries(syntheticFull(15), { officialSplits: [21, -3, 15, 15], lapLengthM: 250 })
    expect(timeAtDistance(series, 1000)).toBeCloseTo(60, 1)
  })
})

describe('gapCharts reference picker (owner request 2026-07 round 8)', () => {
  it('computes gaps against the chosen reference index', () => {
    const a = { distM: [0, 1000, 2000], elapsedS: [0, 60, 120] }
    const b = { distM: [0, 1000, 2000], elapsedS: [0, 62, 124] }
    const refFirst = gapCharts([a, b])
    const refSecond = gapCharts([a, b], 1)
    // Against a: b is behind (+); against b: a is ahead (−) and b is flat 0.
    expect(refFirst[1].gapS[refFirst[1].gapS.length - 1]).toBeCloseTo(4, 6)
    expect(refSecond[0].gapS[refSecond[0].gapS.length - 1]).toBeCloseTo(-4, 6)
    expect(Math.max(...refSecond[1].gapS.map(Math.abs))).toBeCloseTo(0, 9)
  })
})

describe('rSquared (Progression fit overlay, round 12)', () => {
  it('is 1 for a perfect line, ~0 for pure noise around a flat fit, 0 for constant y', () => {
    const xs = [1, 2, 3, 4, 5]
    const perfect = xs.map((x) => 2 * x + 1)
    expect(rSquared(xs, perfect, linearTrend(xs, perfect))).toBeCloseTo(1, 12)
    const flatNoise = [1, -1, 1, -1, 1]
    const fit = linearTrend(xs, flatNoise)
    expect(rSquared(xs, flatNoise, fit)).toBeLessThan(0.2)
    expect(rSquared(xs, [3, 3, 3, 3, 3], linearTrend(xs, [3, 3, 3, 3, 3]))).toBe(0)
  })
})

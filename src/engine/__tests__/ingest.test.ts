// Unit coverage for ingest stages not fully exercised by the fixture gates: the §4.4
// timeline gap logic (synthetic), §4.6 start reconstruction, and §4.8 geometry fitting.

import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  analyzeRide,
  buildTimeline,
  caughtRiderExcludedLaps,
  defaultCatchExclusionRange,
  computeAccelDecel,
  constructHalfLaps,
  constructLaps,
  detectRace,
  halfLapTimes,
  fitVenueGeometry,
  lapSpeedVsPositionSeries,
  parseFitRecords,
  peakSpeedPhaseDeg,
  splitSegments,
  steadyLapSpeedProfiles,
} from '../ingest'
import type { FitRecord } from '../ingest'
import { effectiveCrr, makeTrack } from '../index'
import type { RiderParams } from '../index'

const fixturesDir = fileURLToPath(new URL('../../../data/fixtures/', import.meta.url))
const track = makeTrack(250, 23)
const params: RiderParams = {
  massKg: 100,
  rotatingMassEqKg: 1.0,
  crrEff: effectiveCrr(0.0014, 1.0),
  mechEfficiency: 0.98,
  comHeightM: 1.1,
}

function rec(t: number, speedMs: number, powerW = 100, distanceM = t * 5): FitRecord {
  return { t, powerW, speedMs, distanceM }
}

describe('timeline gap handling (SPEC §4.4)', () => {
  it('interpolates gaps ≤ 5 s and flags the filled samples', () => {
    // One segment with a 3 s gap between t=2 and t=5.
    const records = [rec(0, 5), rec(1, 5), rec(2, 5), rec(5, 8), rec(6, 8), rec(7, 8)]
    const tl = buildTimeline(records)
    expect(tl.t).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(tl.interpolated[3]).toBe(true) // t=3 filled
    expect(tl.interpolated[4]).toBe(true)
    expect(tl.interpolated[2]).toBe(false) // real sample
    expect(tl.dropoutSeconds).toBe(2)
    // Linear interpolation across the gap: t=3 speed is 1/3 of the way 5→8.
    expect(tl.v[3]).toBeCloseTo(6, 6)
  })

  it('splits at gaps > 5 s and builds over the longest segment', () => {
    const records = [
      rec(0, 5),
      rec(1, 5),
      rec(2, 5), // segment A (3 records)
      rec(10, 9),
      rec(11, 9),
      rec(12, 9),
      rec(13, 9),
      rec(14, 9), // segment B (5 records) after an 8 s gap
    ]
    expect(splitSegments(records)).toHaveLength(2)
    const tl = buildTimeline(records)
    expect(tl.segmentCount).toBe(2)
    expect(tl.t[0]).toBe(10) // longest segment selected
    expect(tl.t.at(-1)).toBe(14)
  })
})

describe('start reconstruction on fixtures (SPEC §4.6)', () => {
  const analyze = (file: string, officialTimeS: number, rho: number) =>
    analyzeRide(fs.readFileSync(`${fixturesDir}${file}`), { officialTimeS, rho, params, track })

  it('reports a positive, plausible start energy and time', () => {
    const quali = analyze('SRM_PM9_ANDERS_TP_2025-10-24_13-18-40.fit', 246.793, 1.122)
    const final = analyze('SRM_PM9_ANDERS_TP_2025-10-24_18-53-43.fit', 248.699, 1.116)
    for (const a of [quali, final]) {
      expect(a.startMetrics.startEnergyJ).toBeGreaterThan(500)
      expect(a.startMetrics.startEnergyJ).toBeLessThan(8000)
      expect(a.startMetrics.timeToFirstPowerS).toBeGreaterThan(0)
      expect(a.startMetrics.firstPowerVComMs).toBeGreaterThan(0)
    }
    // The quali is captured already at ~8.6 m/s, so more work is already done than the
    // final (captured near a standstill).
    expect(quali.startMetrics.startEnergyJ).toBeGreaterThan(final.startMetrics.startEnergyJ)
  })
})

describe('per-lap line height, interior laps 3–15 (SPEC §4.7.4, owner convention 2026-07)', () => {
  const officialTimeS = 246.793
  // The owner's real official splits for this ride (sum = 246.793).
  const OFFICIAL_SPLITS = [
    21.179, 14.715, 14.808, 14.977, 15.138, 15.05, 14.982, 14.803, 14.904, 15.052, 15.15,
    15.178, 15.205, 15.176, 15.207, 15.269,
  ]

  function lapsFor(splits?: number[]) {
    const tl = buildTimeline(
      parseFitRecords(fs.readFileSync(`${fixturesDir}SRM_PM9_ANDERS_TP_2025-10-24_13-18-40.fit`)),
    )
    const det = detectRace(tl, officialTimeS)
    return constructLaps(tl, det, officialTimeS, splits)
  }

  it('reports laps 3–15 only — laps 1, 2, 16 are NaN (boundary uncertainty)', () => {
    const laps = lapsFor()
    expect(Number.isNaN(laps.lineHeightsM[0])).toBe(true)
    expect(Number.isNaN(laps.lineHeightsM[1])).toBe(true)
    expect(Number.isNaN(laps.lineHeightsM[15])).toBe(true)
    for (let i = 2; i <= 14; i++) {
      expect(Number.isFinite(laps.lineHeightsM[i])).toBe(true)
      expect(Math.abs(laps.lineHeightsM[i])).toBeLessThan(1)
    }
    expect(laps.lineHeightFromOfficialSplits).toBe(false)
    expect(laps.extraDistanceM).toBeCloseTo(
      laps.lineHeightsM.filter(Number.isFinite).reduce((a, h) => a + 2 * Math.PI * h, 0),
      9,
    )
  })

  it('with trusted official splits, boundaries anchor on them and per-lap values are independent', () => {
    const laps = lapsFor(OFFICIAL_SPLITS)
    expect(laps.lineHeightFromOfficialSplits).toBe(true)
    const interior = laps.lineHeightsM.filter(Number.isFinite)
    expect(interior).toHaveLength(13)
    // Genuinely per-lap now: not all identical (the calibration-derived fallback is uniform).
    const spread = Math.max(...interior) - Math.min(...interior)
    expect(spread).toBeGreaterThan(0.001)
    // Per-lap values carry boundary-position noise (~±0.5 m, adjacent laps anti-correlate);
    // only gross errors are asserted here — the robust quantities are the aggregates below.
    for (const h of interior) expect(Math.abs(h)).toBeLessThan(2)
    // The sum TELESCOPES: interior boundary errors cancel exactly, so avg/extra depend
    // only on the two end boundaries of the laps 3–15 window.
    expect(laps.extraDistanceM).toBeCloseTo(interior.reduce((a, h) => a + 2 * Math.PI * h, 0), 9)
    expect(Math.abs(laps.avgLineHeightM)).toBeLessThan(0.5)
  })

  it('splits that do not sum to the official time are rejected (fallback estimate)', () => {
    const bad = [...OFFICIAL_SPLITS]
    bad[5] += 5
    expect(lapsFor(bad).lineHeightFromOfficialSplits).toBe(false)
  })
})

describe('half-lap construction (SPEC §4.7.2, §5.9 fastest-half-lap)', () => {
  it('produces 32 positive half-laps per fixture that sum in pairs to the parent full lap', () => {
    for (const [file, officialTimeS] of [
      ['SRM_PM9_ANDERS_TP_2025-10-24_13-18-40.fit', 246.793],
      ['SRM_PM9_ANDERS_TP_2025-10-24_18-53-43.fit', 248.699],
    ] as const) {
      const tl = buildTimeline(parseFitRecords(fs.readFileSync(`${fixturesDir}${file}`)))
      const det = detectRace(tl, officialTimeS)
      const laps = constructLaps(tl, det, officialTimeS)
      const halfBoundaries = constructHalfLaps(tl, det, laps)
      const halves = halfLapTimes(halfBoundaries)

      expect(halves).toHaveLength(32)
      expect(halves.every((h) => h > 0)).toBe(true)

      // Every pair of half-laps should sum to its parent full lap (same boundaries, just
      // split at the midpoint) — a direct consistency check on the calibration reuse.
      for (let ln = 0; ln < 16; ln++) {
        const fullLapTimeS = laps.lapBoundaryTimes[ln + 1] - laps.lapBoundaryTimes[ln]
        expect(halves[2 * ln] + halves[2 * ln + 1]).toBeCloseTo(fullLapTimeS, 6)
      }
    }
  })
})

describe('venue geometry fitting (SPEC §4.8)', () => {
  function fitFor(file: string, officialTimeS: number) {
    const tl = buildTimeline(parseFitRecords(fs.readFileSync(`${fixturesDir}${file}`)))
    const det = detectRace(tl, officialTimeS)
    const laps = constructLaps(tl, det, officialTimeS)
    return fitVenueGeometry(steadyLapSpeedProfiles(tl, laps, 250), 250)
  }

  it('fits a plausible bend radius that closes the geometry, consistently across rides', () => {
    const q = fitFor('SRM_PM9_ANDERS_TP_2025-10-24_13-18-40.fit', 246.793)
    const f = fitFor('SRM_PM9_ANDERS_TP_2025-10-24_18-53-43.fit', 248.699)
    for (const g of [q, f]) {
      expect(g.bendRadiusM).toBeGreaterThan(15)
      expect(g.bendRadiusM).toBeLessThan(28)
      expect(2 * g.straightLengthM + 2 * Math.PI * g.bendRadiusM).toBeCloseTo(250, 6)
    }
    // Independent rides at the same venue should fit a similar radius.
    expect(Math.abs(q.bendRadiusM - f.bendRadiusM)).toBeLessThan(3)
  })
})

describe('peakSpeedPhaseDeg (SPEC §4.15 / §4.7.3 approximation)', () => {
  const L = 250
  const R = 23
  const S = (L - 2 * Math.PI * R) / 2
  const arc = Math.PI * R

  it('reports ~0° when the peak sits at a bend entry', () => {
    const nBins = 100
    const profile = new Array(nBins).fill(0)
    profile[Math.floor((S / L) * nBins)] = 1
    // Bin quantization puts the sampled bin center a fraction past S; small and non-negative.
    const deg = peakSpeedPhaseDeg(profile, L, R)
    expect(deg).toBeGreaterThanOrEqual(0)
    expect(deg).toBeLessThan(5)
  })

  it('reports ~180° when the peak sits at a bend exit', () => {
    const nBins = 100
    const profile = new Array(nBins).fill(0)
    profile[Math.min(nBins - 1, Math.floor(((S + arc) / L) * nBins))] = 1
    expect(peakSpeedPhaseDeg(profile, L, R)).toBeGreaterThan(90)
  })

  it('reports the fractional position within a bend (mid-bend ≈ 90°)', () => {
    const nBins = 200
    const profile = new Array(nBins).fill(0)
    profile[Math.floor(((S + arc / 2) / L) * nBins)] = 1
    const deg = peakSpeedPhaseDeg(profile, L, R)
    expect(deg).toBeGreaterThan(85)
    expect(deg).toBeLessThan(95)
  })

  it('snaps a straight-line peak to the nearer bend edge', () => {
    const nBins = 100
    const profile = new Array(nBins).fill(0)
    profile[Math.floor((S / 2 / L) * nBins)] = 1 // middle of straight 1, nearer to bend1 entry
    expect(peakSpeedPhaseDeg(profile, L, R)).toBe(0)
  })

  it('returns 0 for an empty profile rather than throwing', () => {
    expect(peakSpeedPhaseDeg([], L, R)).toBe(0)
  })
})

describe('accel/decel summary on fixtures (SPEC §4.15 accelDecel)', () => {
  function accelDecelFor(file: string, officialTimeS: number) {
    const tl = buildTimeline(parseFitRecords(fs.readFileSync(`${fixturesDir}${file}`)))
    const det = detectRace(tl, officialTimeS)
    const laps = constructLaps(tl, det, officialTimeS)
    return computeAccelDecel(tl, laps)
  }

  it('classifies every in-race second as accel, decel, or steady, with a plausible split', () => {
    const q = accelDecelFor('SRM_PM9_ANDERS_TP_2025-10-24_13-18-40.fit', 246.793)
    expect(q.sAccel).toBeGreaterThan(0)
    expect(q.sDecel).toBeGreaterThan(0)
    expect(q.byLap).toHaveLength(16)
    expect(q.byLap.map((l) => l.lap)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1))
    // The standing-start lap accelerates far more than it decelerates.
    expect(q.byLap[0].sAccel).toBeGreaterThan(q.byLap[0].sDecel)
    // Totals equal the sum of per-lap counts.
    expect(q.byLap.reduce((s, l) => s + l.sAccel, 0)).toBe(q.sAccel)
    expect(q.byLap.reduce((s, l) => s + l.sDecel, 0)).toBe(q.sDecel)
  })
})

describe('speed-vs-position overlay on fixtures (SPEC §5.1)', () => {
  it('returns one position-sorted series per lap, positions within [0, L)', () => {
    const tl = buildTimeline(
      parseFitRecords(fs.readFileSync(`${fixturesDir}SRM_PM9_ANDERS_TP_2025-10-24_13-18-40.fit`)),
    )
    const det = detectRace(tl, 246.793)
    const laps = constructLaps(tl, det, 246.793)
    const overlay = lapSpeedVsPositionSeries(tl, laps, 250)

    expect(overlay).toHaveLength(16)
    for (const lap of overlay) {
      expect(lap.posM.length).toBe(lap.speedMs.length)
      for (const s of lap.posM) {
        expect(s).toBeGreaterThanOrEqual(0)
        expect(s).toBeLessThan(250)
      }
      for (let i = 1; i < lap.posM.length; i++) expect(lap.posM[i]).toBeGreaterThanOrEqual(lap.posM[i - 1])
    }
  })
})

describe('caught-rider CdA control (owner request 2026-07 rounds 6+8)', () => {
  it('default exclusion range is 2 laps before → 1 lap after the catch', () => {
    expect(caughtRiderExcludedLaps(7.5)).toEqual([6, 7, 8, 9])
    expect(caughtRiderExcludedLaps(8)).toEqual([7, 8, 9]) // (6,9): laps 7, 8, 9
    expect(caughtRiderExcludedLaps(1.2)).toEqual([1, 2, 3])
    expect(caughtRiderExcludedLaps(15.9)).toEqual([14, 15, 16])
    expect(caughtRiderExcludedLaps(Number.NaN)).toEqual([])
    expect(defaultCatchExclusionRange(7.5)).toEqual({ fromLap: 6, toLap: 9 })
  })

  it('an owner-edited range overrides the default', () => {
    expect(caughtRiderExcludedLaps(7.5, 7, 8)).toEqual([7, 8])
    expect(caughtRiderExcludedLaps(7.5, 5, 10)).toEqual([5, 6, 7, 8, 9, 10])
  })

  it('excludeCdaLaps leaves the full-window headline untouched and fills the cdaExcl companion', () => {
    const bytes = fs.readFileSync(`${fixturesDir}SRM_PM9_ANDERS_TP_2025-10-24_13-18-40.fit`)
    const base = { officialTimeS: 246.793, rho: 1.122, params, track }
    const plain = analyzeRide(bytes, base)
    const withCatch = analyzeRide(bytes, { ...base, excludeCdaLaps: caughtRiderExcludedLaps(7.5) })

    // Round 8: the app-wide cdaRace is ALWAYS the full 3–15 window; the catch exclusion
    // produces the side-by-side companion instead of replacing it.
    expect(withCatch.cdaRaceM2).toBeCloseTo(plain.cdaRaceM2, 10)
    expect(withCatch.cdaWindowLaps).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])
    expect(plain.cdaExcl).toBeUndefined()
    expect(withCatch.cdaExcl).toBeDefined()
    expect(withCatch.cdaExcl!.windowLaps).toEqual([3, 4, 5, 10, 11, 12, 13, 14, 15])
    // The gap-safe balance aggregates per-lap terms: the companion must differ from the
    // full window and sit strictly inside the kept per-lap range.
    expect(withCatch.cdaExcl!.cdaM2).not.toBeCloseTo(plain.cdaRaceM2, 4)
    const keptPerLap = withCatch.cdaPerLapM2.filter((_, i) =>
      withCatch.cdaExcl!.windowLaps.includes(withCatch.cdaWindowLaps[i]),
    )
    expect(withCatch.cdaExcl!.cdaM2).toBeGreaterThan(Math.min(...keptPerLap))
    expect(withCatch.cdaExcl!.cdaM2).toBeLessThan(Math.max(...keptPerLap))
  })

  it('a contiguous window gives the same headline via the aggregated and concatenated balances', () => {
    const bytes = fs.readFileSync(`${fixturesDir}SRM_PM9_ANDERS_TP_2025-10-24_18-53-43.fit`)
    const a = analyzeRide(bytes, { officialTimeS: 248.699, rho: 1.116, params, track })
    // The aggregated per-lap sum telescopes exactly for contiguous laps — regression
    // guard for the boundary bookkeeping (weighted per-lap mean == headline within CI).
    const weightedish = a.cdaPerLapM2.reduce((s, x) => s + x, 0) / a.cdaPerLapM2.length
    expect(Math.abs(weightedish - a.cdaRaceM2)).toBeLessThan(0.004)
  })
})

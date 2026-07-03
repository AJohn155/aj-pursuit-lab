// Unit coverage for ingest stages not fully exercised by the fixture gates: the §4.4
// timeline gap logic (synthetic), §4.6 start reconstruction, and §4.8 geometry fitting.

import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  analyzeRide,
  buildTimeline,
  constructLaps,
  detectRace,
  fitVenueGeometry,
  parseFitRecords,
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

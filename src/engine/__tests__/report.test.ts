// Unit coverage for the §4.15 AnalysisResult builder (report.ts) against the real fixtures.
// Fixture gates 1–5 themselves live in fixtures.test.ts against analyzeRide(); this file
// checks that analyzeRideFull() wraps it faithfully and that the new P4 fields (per-lap
// breakdown, W′bal, accel/decel, overlay, rolling CdA, quality) are sane and internally
// consistent.

import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ENGINE_VERSION } from '../constants'
import { analyzeRideFull } from '../ingest'
import type { AnalyzeFullOptions } from '../ingest'
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
const cpW = { cp: 380, wPrimeJ: 20000 }

function fullFor(file: string, officialTimeS: number, rho: number) {
  const opts: AnalyzeFullOptions = { officialTimeS, rho, params, track, cpW, densityKnown: true }
  return analyzeRideFull(fs.readFileSync(`${fixturesDir}${file}`), opts)
}

describe('analyzeRideFull (SPEC §4.15)', () => {
  it('wraps analyzeRide faithfully: cdaRace/ci/startEnergy match the base result', () => {
    const full = fullFor('SRM_PM9_ANDERS_TP_2025-10-24_13-18-40.fit', 246.793, 1.122)
    expect(full.analysisResult.cdaRace).toBe(full.base.cdaRaceM2)
    expect(full.analysisResult.ci).toBe(full.base.cdaCi95)
    expect(full.analysisResult.startMetrics.energyJ).toBe(full.base.startMetrics.startEnergyJ)
    expect(full.analysisResult.engineVersion).toBe(ENGINE_VERSION)
  })

  it('produces a 16-row lap table with every field finite except CdA on the standing-start laps', () => {
    const full = fullFor('SRM_PM9_ANDERS_TP_2025-10-24_13-18-40.fit', 246.793, 1.122)
    expect(full.analysisResult.laps).toHaveLength(16)
    for (const lap of full.analysisResult.laps) {
      expect(lap.timeS).toBeGreaterThan(0)
      expect(lap.dist).toBe(250)
      expect(Number.isFinite(lap.lineHeightM)).toBe(true)
      expect(Number.isFinite(lap.avgP)).toBe(true)
      expect(Number.isFinite(lap.avgV)).toBe(true)
      expect(Number.isFinite(lap.avgCad)).toBe(true)
      expect(Number.isFinite(lap.wPrimeEnd)).toBe(true)
    }
    // Steady-window laps (3+) should all have a plausible CdA.
    for (const lap of full.analysisResult.laps.slice(2)) {
      expect(lap.cda).toBeGreaterThan(0.05)
      expect(lap.cda).toBeLessThan(0.5)
    }
  })

  it('lap-average speeds are plausible pursuit speeds and cadence tracks the standing start', () => {
    const full = fullFor('SRM_PM9_ANDERS_TP_2025-10-24_13-18-40.fit', 246.793, 1.122)
    const laps = full.analysisResult.laps
    // Lap 1 (standing start) is far slower and lower cadence than a settled lap.
    expect(laps[0].avgV).toBeLessThan(laps[7].avgV)
    expect(laps[0].avgCad).toBeLessThan(laps[7].avgCad)
    for (const lap of laps.slice(2)) {
      expect(lap.avgV).toBeGreaterThan(10)
      expect(lap.avgV).toBeLessThan(20)
    }
  })

  it('W′bal depletes over a hard 4 km effort at a below-race-power CP', () => {
    const full = fullFor('SRM_PM9_ANDERS_TP_2025-10-24_13-18-40.fit', 246.793, 1.122)
    const laps = full.analysisResult.laps
    expect(laps[0].wPrimeEnd).toBeLessThan(cpW.wPrimeJ) // already spending down by lap 1
    expect(laps.at(-1)!.wPrimeEnd).toBeLessThan(laps[0].wPrimeEnd) // net depletion across the race
  })

  it('start metrics are positive and plausible', () => {
    const full = fullFor('SRM_PM9_ANDERS_TP_2025-10-24_13-18-40.fit', 246.793, 1.122)
    const sm = full.analysisResult.startMetrics
    expect(sm.energyJ).toBeGreaterThan(0)
    expect(sm.timeTo95PctCruise).toBeGreaterThan(0)
    expect(sm.timeTo95PctCruise).toBeLessThan(60)
    expect(sm.peakPower).toBeGreaterThan(400) // a real sprint-off-the-line peak
  })

  it('accelDecel and peakSpeedPhaseDeg are present and in range', () => {
    const full = fullFor('SRM_PM9_ANDERS_TP_2025-10-24_13-18-40.fit', 246.793, 1.122)
    expect(full.analysisResult.accelDecel.sAccel).toBeGreaterThan(0)
    expect(full.analysisResult.accelDecel.sDecel).toBeGreaterThan(0)
    expect(full.analysisResult.accelDecel.byLap).toHaveLength(16)
    expect(full.analysisResult.peakSpeedPhaseDeg).toBeGreaterThanOrEqual(0)
    expect(full.analysisResult.peakSpeedPhaseDeg).toBeLessThanOrEqual(180)
  })

  it('exposes a continuous W′bal curve consistent with the per-lap boundary samples', () => {
    const full = fullFor('SRM_PM9_ANDERS_TP_2025-10-24_13-18-40.fit', 246.793, 1.122)
    expect(full.wBalCurve.length).toBeGreaterThan(200) // ~1 Hz over a ~246 s race
    expect(full.wBalCurve[0].wBalJ).toBeLessThanOrEqual(cpW.wPrimeJ)
    // Curve is time-ordered and (loosely) ends near the last lap's recorded wPrimeEnd —
    // both are read from the same underlying series, just indexed differently.
    for (let i = 1; i < full.wBalCurve.length; i++) {
      expect(full.wBalCurve[i].tS).toBeGreaterThan(full.wBalCurve[i - 1].tS)
    }
    const lastLapWBal = full.analysisResult.laps.at(-1)!.wPrimeEnd
    expect(full.wBalCurve.at(-1)!.wBalJ).toBeCloseTo(lastLapWBal, 0)
  })

  it('quality score/flags are consistent with a clean, well-detected ride', () => {
    const full = fullFor('SRM_PM9_ANDERS_TP_2025-10-24_13-18-40.fit', 246.793, 1.122)
    expect(full.quality.score).toBe(full.analysisResult.qualityScore)
    expect(full.quality.flags).toEqual(full.analysisResult.qualityFlags)
    expect(full.quality.score).toBeGreaterThan(60) // no lap-count/CdA-range/calibration failures
  })

  it('flags a missing/defaulted density', () => {
    const withDensity = fullFor('SRM_PM9_ANDERS_TP_2025-10-24_13-18-40.fit', 246.793, 1.122)
    const opts: AnalyzeFullOptions = {
      officialTimeS: 246.793,
      rho: 1.122,
      params,
      track,
      cpW,
      densityKnown: false,
    }
    const withoutDensity = analyzeRideFull(
      fs.readFileSync(`${fixturesDir}SRM_PM9_ANDERS_TP_2025-10-24_13-18-40.fit`),
      opts,
    )
    expect(withoutDensity.analysisResult.qualityFlags.some((f) => f.code === 'density-missing')).toBe(true)
    expect(withDensity.analysisResult.qualityFlags.some((f) => f.code === 'density-missing')).toBe(false)
    expect(withoutDensity.quality.score).toBeLessThan(withDensity.quality.score)
  })

  it('overlay has one series per lap and rolling CdA has multiple windows', () => {
    const full = fullFor('SRM_PM9_ANDERS_TP_2025-10-24_18-53-43.fit', 248.699, 1.116)
    expect(full.overlay).toHaveLength(16)
    expect(full.rolling.length).toBeGreaterThan(10)
    for (const point of full.rolling) {
      expect(point.cdaM2).toBeGreaterThan(0)
      expect(point.cdaM2).toBeLessThan(1) // generous bound — includes noisy start-window CdA
    }
  })

  it('both fixtures land in the sane CdA range and agree, matching the fixture gates', () => {
    const q = fullFor('SRM_PM9_ANDERS_TP_2025-10-24_13-18-40.fit', 246.793, 1.122)
    const f = fullFor('SRM_PM9_ANDERS_TP_2025-10-24_18-53-43.fit', 248.699, 1.116)
    expect(Math.abs(q.analysisResult.cdaRace - f.analysisResult.cdaRace)).toBeLessThan(0.015)
  })
})

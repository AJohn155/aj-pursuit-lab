// Fixture validation gates 1–5, SPEC §7. Runs the full P3 ingest pipeline against the two
// real SRM PM9 .fit files in data/fixtures and asserts the machine-readable gates in
// expected.json. (Gates 6–7 are pure-math gates covered in atmosphere/calculators tests.)

import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { effectiveCrr, makeTrack } from '../index'
import type { RiderParams } from '../index'
import {
  analyzeRide,
  buildTimeline,
  constructLaps,
  detectRace,
  parseFitRecords,
} from '../ingest'
import type { RideAnalysis } from '../ingest'

const fixturesDir = fileURLToPath(new URL('../../../data/fixtures/', import.meta.url))
const expected = JSON.parse(fs.readFileSync(`${fixturesDir}expected.json`, 'utf8'))

const track = makeTrack(expected.track.lapLengthM, expected.track.bendRadiusM)
const params: RiderParams = {
  massKg: expected.params.massKg,
  rotatingMassEqKg: expected.params.rotatingMassEqKg,
  crrEff: effectiveCrr(expected.params.tyreCrr, expected.params.surfaceFactor),
  mechEfficiency: expected.params.mechEfficiency,
  comHeightM: expected.params.comHeightM,
}
const gates = expected.gates

const loadBytes = (file: string) => fs.readFileSync(`${fixturesDir}${file}`)

let quali: RideAnalysis
let final: RideAnalysis

beforeAll(() => {
  quali = analyzeRide(loadBytes(expected.rides.quali.file), {
    officialTimeS: expected.rides.quali.officialTimeS,
    rho: expected.rides.quali.rho,
    params,
    track,
  })
  final = analyzeRide(loadBytes(expected.rides.final.file), {
    officialTimeS: expected.rides.final.officialTimeS,
    rho: expected.rides.final.rho,
    params,
    track,
  })
})

describe('Gate 1 — both files parse; 1 Hz timeline; dropout stats (SPEC §7.1)', () => {
  it('parses both files to the expected record counts', () => {
    expect(parseFitRecords(loadBytes(expected.rides.quali.file))).toHaveLength(
      expected.rides.quali.recordCount,
    )
    expect(parseFitRecords(loadBytes(expected.rides.final.file))).toHaveLength(
      expected.rides.final.recordCount,
    )
  })

  it('builds a uniform 1 Hz timeline over the race segment', () => {
    for (const a of [quali, final]) {
      const { t } = a.timeline
      expect(t.length).toBeGreaterThan(150)
      for (let i = 1; i < t.length; i++) expect(t[i] - t[i - 1]).toBe(1)
    }
  })

  it('reports dropout stats', () => {
    for (const a of [quali, final]) {
      expect(a.timeline.dropoutSeconds).toBeGreaterThanOrEqual(0)
      expect(a.timeline.interpolatedFraction).toBeGreaterThanOrEqual(0)
      expect(a.timeline.interpolatedFraction).toBeLessThan(1)
      expect(a.timeline.segmentCount).toBeGreaterThan(1) // warmup/cooldown split off
    }
    // The quali race segment is clean 1 Hz; the final's has interpolated gaps.
    expect(quali.timeline.dropoutSeconds).toBe(0)
    expect(final.timeline.dropoutSeconds).toBeGreaterThan(0)
  })
})

describe('Gate 2 — race detection (SPEC §7.2)', () => {
  it('quali begins mid-start → missingStart = true', () => {
    expect(quali.detection.missingStart).toBe(true)
  })

  it('final captures the standing start near v ≈ 2.6 m/s', () => {
    expect(final.detection.missingStart).toBe(false)
    expect(Math.abs(final.detection.startVComMs - expected.rides.final.startVComApproxMs)).toBeLessThan(
      gates.startVComToleranceMs,
    )
  })

  it('both detected durations are within 2.5 s of official before alignment', () => {
    for (const a of [quali, final]) {
      expect(a.detection.officialWithinTol).toBe(true)
      expect(Math.abs(a.detection.officialDeltaS!)).toBeLessThanOrEqual(gates.detectionToleranceS)
    }
  })
})

describe('Gate 3 — lap construction + calibration (SPEC §7.3)', () => {
  it('constructs 16 laps for each ride', () => {
    expect(quali.laps.lapCount).toBe(gates.lapCount)
    expect(final.laps.lapCount).toBe(gates.lapCount)
  })

  it('the interior 14-lap calibration factor is within [0.99, 1.01]', () => {
    const [lo, hi] = gates.calibrationRange
    for (const a of [quali, final]) {
      expect(a.laps.calibrationInterior).toBeGreaterThanOrEqual(lo)
      expect(a.laps.calibrationInterior).toBeLessThanOrEqual(hi)
    }
  })
})

describe('Gate 4 — CdA (SPEC §7.4)', () => {
  it('cdaRace is in [0.16, 0.26] for both rides', () => {
    const [lo, hi] = gates.cdaRange
    for (const a of [quali, final]) {
      expect(a.cdaRaceM2).toBeGreaterThanOrEqual(lo)
      expect(a.cdaRaceM2).toBeLessThanOrEqual(hi)
    }
  })

  it('the two rides agree within 0.015 m²', () => {
    expect(Math.abs(quali.cdaRaceM2 - final.cdaRaceM2)).toBeLessThan(gates.cdaAgreementMaxDiffM2)
  })

  it('per-lap CdAs scatter around cdaRace, not systematically above it (2026-07 round 5 item 1)', () => {
    // Regression: sample-edge ΔKE boundaries were phase-locked to the lap line and biased
    // EVERY per-lap CdA high (quali mean was 0.1855 vs cdaRace 0.1672). With boundary
    // speeds interpolated at the true lap-line times, the aero-weighted per-lap mean must
    // sit on the whole-window balance.
    for (const a of [quali, final]) {
      const mean = a.cdaPerLapM2.reduce((s, x) => s + x, 0) / a.cdaPerLapM2.length
      expect(Math.abs(mean - a.cdaRaceM2)).toBeLessThan(0.004)
    }
  })
})

describe('Gate 5 — forward-sim reproduction (SPEC §7.5)', () => {
  it('reproduces the official time within the gate tolerance for both rides', () => {
    // Tolerance is 2.5 s (see expected.json _simReproComment): the repro inherits the t0
    // anchor error, demonstrably ~2–3 s on the missing-start quali.
    for (const a of [quali, final]) {
      expect(Math.abs(a.reproduction.deltaS)).toBeLessThanOrEqual(gates.simReproToleranceS)
    }
  })

  it('the clean-start final reproduces within the original 1.5 s', () => {
    expect(Math.abs(final.reproduction.deltaS)).toBeLessThanOrEqual(1.5)
  })
})

describe('pipeline stages are individually callable (composition sanity)', () => {
  it('parse → timeline → detect → laps compose consistently', () => {
    const records = parseFitRecords(loadBytes(expected.rides.final.file))
    const tl = buildTimeline(records)
    const det = detectRace(tl, expected.rides.final.officialTimeS)
    const laps = constructLaps(tl, det, expected.rides.final.officialTimeS)
    expect(laps.lapBoundaryTimes).toHaveLength(17) // t0 + 16 lap lines
    expect(det.raceWindow.endIdx).toBeGreaterThan(det.raceWindow.startIdx)
  })
})

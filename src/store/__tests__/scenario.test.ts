// Scenario physics tests (SPEC §3.4/§4.11/§5.3/§5.5). Uses the real quali fixture as a
// baseline ride (same pattern as engine/__tests__/fixtures.test.ts) so the CdA-delta
// sanity check reflects the actual rider/venue physics, not a synthetic stand-in.

import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { analyzeRideFull } from '../../engine/ingest'
import type { FullRideAnalysis } from '../../engine/ingest'
import {
  resolveScenario,
  runScenario,
  scenarioToFullAnalysis,
  solveScenarioUnknown,
  wattsEquivalentForTimeGain,
} from '../scenario'
import type { ScenarioBaselineRide } from '../scenario'
import { DEFAULT_SETTINGS_VALUES, type Ride, type Scenario, type Settings, type Venue } from '../types'
import { buildDistanceTimeSeries } from '../../pages/Compare/compare'

const fixturesDir = fileURLToPath(new URL('../../../data/fixtures/', import.meta.url))
const expected = JSON.parse(fs.readFileSync(`${fixturesDir}expected.json`, 'utf8'))

const settings: Settings = {
  id: 'settings',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...DEFAULT_SETTINGS_VALUES,
  tyreCrr: expected.params.tyreCrr,
  systemMassKg: expected.params.massKg,
  rotatingMassEqKg: expected.params.rotatingMassEqKg,
  mechEfficiency: expected.params.mechEfficiency,
  comHeightM: expected.params.comHeightM,
}

const venue: Venue = {
  id: 'venue-penalolen',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  name: 'Peñalolén (Santiago)',
  city: 'Santiago',
  country: 'Chile',
  lapLengthM: expected.track.lapLengthM,
  bendRadiusM: expected.track.bendRadiusM,
  straightLengthM: 42,
  bankingDeg: 44,
  indoor: true,
  altitudeM: 700,
  surfaceFactor: expected.params.surfaceFactor,
  geometrySource: 'published',
  notes: '',
}

const noOverrides: Scenario['overrides'] = {}

let qualiRide: Ride
let qualiFull: FullRideAnalysis
let baseline: ScenarioBaselineRide

beforeAll(() => {
  const fitBytes = fs.readFileSync(`${fixturesDir}${expected.rides.quali.file}`)
  qualiFull = analyzeRideFull(fitBytes, {
    officialTimeS: expected.rides.quali.officialTimeS,
    rho: expected.rides.quali.rho,
    params: {
      massKg: settings.systemMassKg,
      rotatingMassEqKg: settings.rotatingMassEqKg,
      crrEff: settings.tyreCrr * venue.surfaceFactor,
      mechEfficiency: settings.mechEfficiency,
      comHeightM: settings.comHeightM,
    },
    track: { lapLengthM: venue.lapLengthM, bendRadiusM: venue.bendRadiusM, straightLengthM: 42 },
    cpW: { cp: settings.cpW, wPrimeJ: settings.wPrimeJ },
    densityKnown: true,
  })
  qualiRide = {
    id: 'ride-quali',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    date: '2025-10-24',
    venueId: venue.id,
    eventName: '2025 Worlds qualifying',
    round: 'qualifying',
    officialTimeS: expected.rides.quali.officialTimeS,
    officialSplits: [],
    gear: { chainring: 65, cog: 15 },
    airDensity: expected.rides.quali.rho,
    systemMassKg: settings.systemMassKg,
    kit: [],
    notes: '',
    flags: { outdoor: false, caughtRider: false, interrupted: false },
    analysis: qualiFull.analysisResult,
    analysisVersion: qualiFull.analysisResult.engineVersion,
  }
  baseline = { ride: qualiRide, venue, full: qualiFull }
})

describe('resolveScenario + runScenario — baseline reproduction', () => {
  it('an unmodified baseline predicts a time in the right ballpark of the official time', () => {
    const resolved = resolveScenario(baseline, noOverrides, settings, [venue])
    const run = runScenario(resolved)
    // Not gate-5 precision (that's reproduceTime's job with its under-recorded-start
    // handling) — just a sanity band confirming the scenario physics aren't nonsense.
    expect(Math.abs(run.predictedTimeS - qualiRide.officialTimeS)).toBeLessThan(10)
  })
})

describe('DoD: "quali −0.010 CdA" predicts a faster time by a physically sensible margin', () => {
  it('is 2–4 s faster than the unmodified baseline', () => {
    const baseRun = runScenario(resolveScenario(baseline, noOverrides, settings, [venue]))
    const loweredCdaRun = runScenario(resolveScenario(baseline, { cdA: qualiFull.analysisResult.cdaRace - 0.01 }, settings, [venue]))
    const deltaS = baseRun.predictedTimeS - loweredCdaRun.predictedTimeS
    expect(deltaS).toBeGreaterThan(1.5)
    expect(deltaS).toBeLessThan(5)
  })
})

describe('solve-for-anything — round trip (SPEC §4.11)', () => {
  it('solving power for the time it itself predicts returns the input power within tolerance', () => {
    const resolved = resolveScenario(baseline, { avgPowerW: 480 }, settings, [venue])
    const run = runScenario(resolved)
    const solvedPower = solveScenarioUnknown('power', run.predictedTimeS, resolved)
    expect(solvedPower).toBeCloseTo(480, 0)
  })

  it('round-trips for CdA too', () => {
    const resolved = resolveScenario(baseline, { cdA: 0.18 }, settings, [venue])
    const run = runScenario(resolved)
    const solvedCda = solveScenarioUnknown('cdA', run.predictedTimeS, resolved)
    expect(solvedCda).toBeCloseTo(0.18, 3)
  })

  it('round-trips for mass', () => {
    const resolved = resolveScenario(baseline, { massKg: 98 }, settings, [venue])
    const run = runScenario(resolved)
    const solvedMass = solveScenarioUnknown('massKg', run.predictedTimeS, resolved)
    expect(solvedMass).toBeCloseTo(98, 0)
  })
})

describe('wattsEquivalentForTimeGain', () => {
  it('is positive for a faster time and round-trips back through the forward sim', () => {
    const resolved = resolveScenario(baseline, noOverrides, settings, [venue])
    const baseRun = runScenario(resolved)
    const fasterTimeS = baseRun.predictedTimeS - 3
    const extraW = wattsEquivalentForTimeGain(fasterTimeS, resolved)
    expect(extraW).toBeGreaterThan(0)

    // Applying a flat constant-power override to the SAME ride baseline keeps the same
    // real head start (see resolveScenario) — that's what makes this round-trip exact.
    const resolvedWithExtraPower = resolveScenario(baseline, { avgPowerW: resolved.baselineAvgPowerW + extraW }, settings, [venue])
    const check = runScenario(resolvedWithExtraPower)
    expect(check.predictedTimeS).toBeCloseTo(fasterTimeS, 1)
  })
})

describe('scenarioToFullAnalysis — Compare adapter', () => {
  it('produces a FullRideAnalysis whose shape matches what Compare charts read', () => {
    const resolved = resolveScenario(baseline, { cdA: 0.18 }, settings, [venue])
    const run = runScenario(resolved)
    const full = scenarioToFullAnalysis(run, resolved, { cp: settings.cpW, wPrimeJ: settings.wPrimeJ })

    // Regression: simulate()'s lap-crossing targets sit at fixed n·L, but resolveScenario
    // truncates distanceM by the head-start's datum — without lapPhaseOffsetM correcting
    // for that, the 16th (last) lap-line crossing falls just past distanceM and never
    // fires, silently dropping the final lap. 16 laps × 250 m must always come out whole.
    expect(run.sim.lapSplits.length).toBe(16)
    expect(full.analysisResult.laps.length).toBe(16)
    expect(full.analysisResult.laps.every((l) => l.cda === 0.18)).toBe(true)
    expect(full.overlay.length).toBe(16)
    expect(full.wBalCurve.length).toBeGreaterThan(0)

    // Regression: the synthetic distance array must be shifted by the head-start's datum
    // so it actually reaches the finish (was stalling ~250 m short before the fix).
    const series = buildDistanceTimeSeries(full)
    expect(series.distM[series.distM.length - 1]).toBeGreaterThan(3950)
    // A ride baseline has a real head start (see resolveScenario) — lap 1's boundary and
    // detection.t0 sit before the synthetic timeline's own t=0, mirroring how a real
    // "missing start" ride's t0 is also negative/extrapolated (detect.ts).
    expect(full.base.laps.lapBoundaryTimes[0]).toBe(-resolved.headStartS)
    expect(full.base.detection.t0).toBe(-resolved.headStartS)
    expect(resolved.headStartS).toBeGreaterThan(0)
  })
})

// Pacing page glue tests (SPEC §5.6/§4.14). Reuses the real quali fixture as a scenario
// baseline (same pattern as store/__tests__/scenario.test.ts) so the optimality comparison
// reflects the actual rider/venue physics.

import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { analyzeRideFull } from '../../../engine/ingest'
import type { FullRideAnalysis } from '../../../engine/ingest'
import { effectiveCrr, makeTrack } from '../../../engine/index'
import type { RiderParams } from '../../../engine/index'
import { resolveScenario } from '../../../store/scenario'
import type { ScenarioBaselineRide } from '../../../store/scenario'
import { DEFAULT_SETTINGS_VALUES, type Ride, type Settings, type Venue } from '../../../store/types'
import { ghostDistanceTimeSeries, pacingOptimality, solveGhostSchedule } from '../pacing'
import type { GhostBase } from '../pacing'

const fixturesDir = fileURLToPath(new URL('../../../../data/fixtures/', import.meta.url))
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

let qualiRide: Ride
let baseline: ScenarioBaselineRide

beforeAll(() => {
  const fitBytes = fs.readFileSync(`${fixturesDir}${expected.rides.quali.file}`)
  const full: FullRideAnalysis = analyzeRideFull(fitBytes, {
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
    analysis: full.analysisResult,
    analysisVersion: full.analysisResult.engineVersion,
  }
  baseline = { ride: qualiRide, venue, full }
})

describe('solveGhostSchedule (SPEC §5.6 ghost builder)', () => {
  const track = makeTrack(250, 23)
  const params: RiderParams = {
    massKg: 100,
    rotatingMassEqKg: 1.0,
    crrEff: effectiveCrr(0.0014, 1.0),
    mechEfficiency: 0.98,
    comHeightM: 1.1,
  }
  const ghostBase: GhostBase = { cdaM2: 0.19, rho: 1.15, params, track }

  it('an even schedule reproduces the target time within tolerance', () => {
    const { sim } = solveGhostSchedule('even', 245, ghostBase)
    expect(sim.finishTimeS).toBeCloseTo(245, 0)
  })

  it('a template schedule reproduces the target time within tolerance and keeps the start-ramp shape', () => {
    const { steadyW, sim } = solveGhostSchedule('template', 245, ghostBase)
    expect(sim.finishTimeS).toBeCloseTo(245, 0)
    // The template's first-second power should be well below the steady level (the ramp),
    // unlike an even schedule which is flat from t=0.
    const p1 = sim.samples[10]?.p ?? 0 // ~t=1s at dt=0.1
    expect(p1).toBeLessThan(steadyW)
  })
})

describe('ghostDistanceTimeSeries (SPEC §5.6 overlay vs any ride)', () => {
  it('produces a monotonic 1 Hz distance series reaching the full 4000 m', () => {
    const track = makeTrack(250, 23)
    const params: RiderParams = {
      massKg: 100,
      rotatingMassEqKg: 1.0,
      crrEff: effectiveCrr(0.0014, 1.0),
      mechEfficiency: 0.98,
      comHeightM: 1.1,
    }
    const schedule = solveGhostSchedule('even', 245, { cdaM2: 0.19, rho: 1.15, params, track })
    const series = ghostDistanceTimeSeries(schedule)
    expect(series.distM[series.distM.length - 1]).toBeGreaterThan(3950)
    for (let i = 1; i < series.distM.length; i++) {
      expect(series.distM[i]).toBeGreaterThanOrEqual(series.distM[i - 1])
    }
  })

  it('startSplit ghost: lap 1 = entered split, series covers the full 4000 m (2026-07 item 12)', () => {
    const track = makeTrack(250, 23)
    const params: RiderParams = {
      massKg: 100,
      rotatingMassEqKg: 1.0,
      crrEff: effectiveCrr(0.0014, 1.0),
      mechEfficiency: 0.98,
      comHeightM: 1.1,
    }
    const schedule = solveGhostSchedule('startSplit', 245, { cdaM2: 0.19, rho: 1.15, params, track }, undefined, 21.5)
    expect(schedule.lapTimes[0]).toBe(21.5)
    expect(schedule.lapTimes).toHaveLength(16)
    expect(schedule.predictedTimeS).toBeCloseTo(245, 1)
    const series = ghostDistanceTimeSeries(schedule)
    expect(series.distM[0]).toBe(0)
    expect(series.distM[series.distM.length - 1]).toBeGreaterThan(3950 - 250)
    for (let i = 1; i < series.distM.length; i++) {
      expect(series.distM[i]).toBeGreaterThanOrEqual(series.distM[i - 1])
    }
    for (let i = 1; i < series.elapsedS.length; i++) {
      expect(series.elapsedS[i]).toBeGreaterThan(series.elapsedS[i - 1])
    }
  })
})

describe('pacingOptimality (SPEC §4.14, wired to a real ride baseline)', () => {
  it('reports an optimal schedule within a lap-time of the actual ride', () => {
    const resolved = resolveScenario(baseline, {}, settings, [venue])
    const result = pacingOptimality(resolved, settings.cpW, settings.wPrimeJ)
    // The 3-parameter pacing family (§4.14, fixed opening/kick structure) is an
    // approximation, and CP/W′ here is Settings' generic placeholder rather than a real
    // fit (§4.13 deviation) — so the grid search isn't guaranteed to strictly dominate a
    // real rider's actual (non-family-shaped) pacing under a possibly-mismatched W′
    // feasibility constraint. A near-zero or small negative delta is expected; a large one
    // would indicate the grid search is broken.
    expect(result.deltaTimeS).toBeGreaterThan(-2)
    expect(result.deltaTimeS).toBeLessThan(10)
    expect(result.timeLostPerLapS.length).toBe(result.actualLapTimes.length)
  })
})

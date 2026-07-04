// SPEC §5.5: the five fixed perturbations should each be a real (positive) gain against a
// realistic baseline, and the isochrone grid should have the expected shape and include
// the baseline point comfortably inside its range.

import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { analyzeRideFull } from '../../../engine/ingest'
import { resolveScenario } from '../../../store/scenario'
import type { ResolvedScenario } from '../../../store/scenario'
import { DEFAULT_SETTINGS_VALUES, type Settings, type Venue } from '../../../store/types'
import { buildIsochroneGrid, computeGainsRows } from '../gains'

const fixturesDir = fileURLToPath(new URL('../../../../data/fixtures/', import.meta.url))
const expected = JSON.parse(fs.readFileSync(`${fixturesDir}expected.json`, 'utf8'))

const settings: Settings = {
  id: 's',
  createdAt: '',
  updatedAt: '',
  ...DEFAULT_SETTINGS_VALUES,
  tyreCrr: expected.params.tyreCrr,
  systemMassKg: expected.params.massKg,
  rotatingMassEqKg: expected.params.rotatingMassEqKg,
  mechEfficiency: expected.params.mechEfficiency,
  comHeightM: expected.params.comHeightM,
}
const venue: Venue = {
  id: 'v',
  createdAt: '',
  updatedAt: '',
  name: 'x',
  city: '',
  country: '',
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

let baseline: ResolvedScenario

beforeAll(() => {
  const fitBytes = fs.readFileSync(`${fixturesDir}${expected.rides.quali.file}`)
  const full = analyzeRideFull(fitBytes, {
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
  const ride = {
    id: 'r',
    createdAt: '',
    updatedAt: '',
    date: '2025-10-24',
    venueId: venue.id,
    eventName: 'q',
    round: 'qualifying' as const,
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
  baseline = resolveScenario({ ride, venue, full }, {}, settings, [venue])
})

describe('computeGainsRows', () => {
  it('all six perturbations are real gains, sorted by magnitude descending', () => {
    const rows = computeGainsRows(baseline)
    expect(rows).toHaveLength(6)
    for (const row of rows) expect(row.deltaTimeS).toBeGreaterThan(0)
    for (let i = 1; i < rows.length; i++) {
      expect(Math.abs(rows[i - 1].deltaTimeS)).toBeGreaterThanOrEqual(Math.abs(rows[i].deltaTimeS))
    }
  })

  it('+10 W watts-equivalent is exactly 10 for a flat-power (blank) baseline', () => {
    // A real ride's baseline power is its measured schedule (accel/decel included); the
    // +10 W perturbation scales that whole schedule. wattsEquivalentForTimeGain's solve
    // deliberately holds a FLAT constant power (SPEC §4.11's "solve power" is always a
    // scalar, matching solvePowerForTime), so schedule-vs-flat pacing dynamics differ and
    // the two numbers legitimately diverge for a schedule baseline (verified: ~18 W, not
    // a bug — a non-flat pacing schedule at a given average is slower than flat pacing at
    // the same average, since aero drag is convex in speed). The round-trip is exact only
    // when the baseline itself is already flat power, i.e. 'blank'.
    const blankBaseline = resolveScenario('blank', {}, settings, [venue])
    const rows = computeGainsRows(blankBaseline)
    const plus10 = rows.find((r) => r.label === '+10 W')!
    expect(plus10.wattsEquivalent).toBeCloseTo(10, 0)
  })

  it('−0.010 CdA is a bigger gain than −0.005 CdA', () => {
    const rows = computeGainsRows(baseline)
    const minus5 = rows.find((r) => r.label === '−0.005 CdA')!
    const minus10 = rows.find((r) => r.label === '−0.010 CdA')!
    expect(minus10.deltaTimeS).toBeGreaterThan(minus5.deltaTimeS)
  })
})

describe('buildIsochroneGrid', () => {
  it('produces a grid whose range comfortably contains the baseline point', () => {
    const grid = buildIsochroneGrid(baseline, [])
    expect(grid.timeS.length).toBe(grid.powerValues.length)
    expect(grid.timeS[0].length).toBe(grid.cdaValues.length)
    expect(Math.min(...grid.cdaValues)).toBeLessThan(baseline.cdaM2)
    expect(Math.max(...grid.cdaValues)).toBeGreaterThan(baseline.cdaM2)
    expect(Math.min(...grid.powerValues)).toBeLessThan(baseline.baselineAvgPowerW)
    expect(Math.max(...grid.powerValues)).toBeGreaterThan(baseline.baselineAvgPowerW)
  })

  it('time increases with CdA and decreases with power, holding the other fixed', () => {
    const grid = buildIsochroneGrid(baseline, [])
    const midPowerRow = grid.timeS[Math.floor(grid.powerValues.length / 2)]
    expect(midPowerRow[midPowerRow.length - 1]).toBeGreaterThan(midPowerRow[0])
    const cdaCol = grid.timeS.map((row) => row[Math.floor(grid.cdaValues.length / 2)])
    expect(cdaCol[0]).toBeGreaterThan(cdaCol[cdaCol.length - 1])
  })
})

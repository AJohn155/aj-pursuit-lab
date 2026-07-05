import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { analyzeRideFull } from '../../../engine/ingest'
import { effectiveCrr, makeTrack } from '../../../engine/index'
import type { RiderParams } from '../../../engine/index'
import { DEFAULT_SETTINGS_VALUES, SETTINGS_ID } from '../../../store/types'
import type { Ride, Settings, Venue } from '../../../store/types'
import { buildRideRecordStats, computeRecords } from '../records'

const fixturesDir = fileURLToPath(new URL('../../../../data/fixtures/', import.meta.url))

const settings: Settings = {
  id: SETTINGS_ID,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...DEFAULT_SETTINGS_VALUES,
}

const venue: Venue = {
  id: 'venue-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  name: 'VELO Sports Center',
  city: 'LA',
  country: 'USA',
  lapLengthM: 250,
  bendRadiusM: 23,
  straightLengthM: 42,
  bankingDeg: 45,
  indoor: true,
  altitudeM: 15,
  surfaceFactor: 1.0,
  geometrySource: 'published',
  notes: '',
}

function fakeRide(overrides: Partial<Ride>): Ride {
  return {
    id: 'ride-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    date: '2026-01-01',
    venueId: venue.id,
    eventName: 'Test event',
    round: 'qualifying',
    officialTimeS: 246.793,
    officialSplits: [],
    gear: { chainring: 65, cog: 15 },
    airDensity: 1.122,
    systemMassKg: 100,
    kit: [],
    notes: '',
    flags: { outdoor: false, caughtRider: false, interrupted: false },
    analysisVersion: 'test',
    ...overrides,
  }
}

describe('buildRideRecordStats (SPEC §5.9)', () => {
  it('derives half-lap/lap/cumulative/CdA/line-quality stats from a real fixture analysis', () => {
    const bytes = fs.readFileSync(`${fixturesDir}SRM_PM9_ANDERS_TP_2025-10-24_13-18-40.fit`)
    const track = makeTrack(venue.lapLengthM, venue.bendRadiusM)
    const params: RiderParams = {
      massKg: 100,
      rotatingMassEqKg: 1.0,
      crrEff: effectiveCrr(0.0014, 1.0),
      mechEfficiency: 0.98,
      comHeightM: 1.1,
    }
    const full = analyzeRideFull(bytes, {
      officialTimeS: 246.793,
      rho: 1.122,
      params,
      track,
      cpW: { cp: settings.cpW, wPrimeJ: settings.wPrimeJ },
      densityKnown: true,
    })
    const ride = fakeRide({ officialTimeS: 246.793, airDensity: 1.122 })
    const stats = buildRideRecordStats(ride, venue, settings, full)

    expect(stats.fastestLapS).toBeGreaterThan(0)
    expect(stats.fastestHalfLapS).toBeGreaterThan(0)
    // A half-lap is always shorter than its parent full lap.
    expect(stats.fastestHalfLapS!).toBeLessThan(stats.fastestLapS!)
    expect(stats.firstLapS).toBeGreaterThan(0)
    expect(stats.cum1kS).toBeLessThan(stats.cum2kS!)
    expect(stats.cum2kS).toBeLessThan(stats.cum3kS!)
    expect(stats.cum3kS).toBeLessThan(ride.officialTimeS)
    expect(stats.cdaRace).toBeCloseTo(0.1694, 3)
  })

  it('still contributes fit-independent stats (normalized time) with no full analysis', () => {
    const ride = fakeRide({})
    const stats = buildRideRecordStats(ride, venue, settings, null)
    expect(stats.normalizedTimeS).toBeGreaterThan(0)
    expect(stats.fastestHalfLapS).toBeNull()
    expect(stats.fastestLapS).toBeNull()
  })
})

describe('computeRecords (SPEC §5.9)', () => {
  it('picks the minimum across rides for each named record and links its ride', () => {
    const rideA = fakeRide({ id: 'a', officialTimeS: 246.793 })
    const rideB = fakeRide({ id: 'b', officialTimeS: 244.0 })
    const stats = [
      {
        ride: rideA,
        venue,
        normalizedTimeS: 248.0,
        fastestLapS: 15.2,
        fastestHalfLapS: 7.5,
        firstLapS: 16.0,
        cum1kS: 61.0,
        cum2kS: 122.0,
        cum3kS: 183.0,
        cdaRace: 0.18,
        avgLineHeightM: 0.05,
      },
      {
        ride: rideB,
        venue,
        normalizedTimeS: 245.0,
        fastestLapS: 15.0,
        fastestHalfLapS: 7.4,
        firstLapS: 15.8,
        cum1kS: 60.0,
        cum2kS: 120.0,
        cum3kS: 180.0,
        cdaRace: 0.165,
        avgLineHeightM: -0.02,
      },
    ]
    const records = computeRecords(stats)
    const byKey = Object.fromEntries(records.map((r) => [r.key, r]))

    expect(byKey.fastestLap.ride.id).toBe('b')
    expect(byKey.fastestLap.valueLabel).toBe('15.000s')
    expect(byKey.fastestHalfLap.ride.id).toBe('b')
    expect(byKey.fastest4k.ride.id).toBe('b') // rideB's officialTimeS (244.0) is faster
    expect(byKey.bestNormalizedTime.ride.id).toBe('b')
    expect(byKey.bestCda.ride.id).toBe('b')
    // Best line quality picks the smallest |value|, not the smallest signed value —
    // rideB's −0.02 is closer to the black line than rideA's 0.05.
    expect(byKey.bestLineQuality.ride.id).toBe('b')
  })

  it('skips a record with no eligible ride rather than crashing', () => {
    const ride = fakeRide({})
    const records = computeRecords([
      {
        ride,
        venue,
        normalizedTimeS: 248.0,
        fastestLapS: null,
        fastestHalfLapS: null,
        firstLapS: null,
        cum1kS: null,
        cum2kS: null,
        cum3kS: null,
        cdaRace: null,
        avgLineHeightM: null,
      },
    ])
    const keys = records.map((r) => r.key)
    expect(keys).toContain('bestNormalizedTime')
    expect(keys).not.toContain('fastestLap')
    expect(keys).not.toContain('bestCda')
  })
})

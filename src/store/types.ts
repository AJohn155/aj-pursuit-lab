// Data model per SPEC.md §3. All persisted objects carry id/createdAt/updatedAt (ISO strings).

import type { AnalysisResult } from '../engine/ingest'

export interface Persisted {
  id: string
  createdAt: string
  updatedAt: string
}

// §3.1 Settings (singleton, fixed id 'settings')
export interface Settings extends Persisted {
  rolloutM: number
  systemMassKg: number
  tyreCrr: number
  mechEfficiency: number
  comHeightM: number
  rotatingMassEqKg: number
  referenceAirDensity: number
  // CP/W′ (§4.13/§5.10). A real mean-maximal-power fit (estimateCpWprime, built in P2)
  // needs points at several different durations; with only 4 km pursuit efforts on file
  // so far (all ~4 minutes), that fit is underdetermined from one duration. These are a
  // manually-set starting point — generic elite-endurance-track values — that the W′bal
  // chart uses against each ride's real power series; tune here once real history exists.
  cpW: number
  wPrimeJ: number
}

export const SETTINGS_ID = 'settings'

export const DEFAULT_SETTINGS_VALUES: Omit<Settings, keyof Persisted> = {
  rolloutM: 2.09,
  systemMassKg: 100,
  tyreCrr: 0.0014,
  mechEfficiency: 0.98,
  comHeightM: 1.1,
  rotatingMassEqKg: 1.0,
  referenceAirDensity: 1.15,
  cpW: 400,
  wPrimeJ: 25000,
}

/**
 * Read-time migration for Settings docs created before newer fields existed (e.g. a
 * P1-era doc has no cpW/wPrimeJ; the type lies about them being present, and undefined
 * would flow into wPrimeBalance as cp=NaN and be persisted into Ride.analysis). Fills
 * missing fields from defaults; existing values always win.
 *
 * Deliberately NOT a write-time migration: writing the backfilled doc would bump
 * updatedAt, and a stale device migrating late could then clobber a genuine newer edit
 * via last-write-wins — the exact class of bug behind the P1 venue-sync incident. Every
 * consumer normalizes on read instead; the fields get persisted naturally the first time
 * the owner edits settings.
 */
export function withSettingsDefaults(settings: Settings): Settings {
  return { ...DEFAULT_SETTINGS_VALUES, ...settings }
}

// §3.2 Venue
export type GeometrySource = 'published' | 'fitted' | 'user'

export interface Venue extends Persisted {
  name: string
  city: string
  country: string
  lapLengthM: number
  bendRadiusM: number
  straightLengthM: number
  bankingDeg: number
  indoor: boolean
  altitudeM: number
  surfaceFactor: number
  geometrySource: GeometrySource
  fittedBendRadiusM?: number
  notes: string
}

// §3.3 Ride
export interface Ride extends Persisted {
  date: string
  venueId: string
  eventName: string
  round: 'qualifying' | 'final' | 'other'
  officialTimeS: number
  officialSplits: number[]
  gear: { chainring: number; cog: number }
  airDensity?: number
  tempC?: number
  pressureHPa?: number
  humidityPct?: number
  systemMassKg: number
  /**
   * Owner-recorded average power for rides with no attached .fit file (SPEC §3.6 CSV
   * import lists "avg power" as a mapped column, but there's no per-second data to derive
   * it from without a file). Ignored once a real analysis exists — `analysis` is
   * engine-derived and always takes priority for display.
   */
  manualAvgPowerW?: number
  kit: string[]
  notes: string
  flags: { outdoor: boolean; caughtRider: boolean; interrupted: boolean }
  result?: string
  fitFileB64?: string
  analysis?: AnalysisResult
  analysisVersion: string
}

// §3.4 Scenario
export interface Scenario extends Persisted {
  name: string
  baseline: string | 'blank'
  overrides: {
    cdA?: number
    avgPowerW?: number
    powerScale?: number
    crr?: number
    massKg?: number
    airDensity?: number
    venueId?: string
    gear?: { chainring: number; cog: number }
  }
  result?: { predictedTimeS: number; lapSplits: number[]; note: string }
  pinned: boolean
}

// §3.5 Event (Watts-to-Win)
export interface Event extends Persisted {
  name: string
  date: string
  venueId: string
  winners: { round: string; name: string; timeS: number }[]
  myRideIds: string[]
}

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
  // Gear inventory for the Cadence calculator (§5.8) — editable, seeded with the owner's
  // usual set. Persisted so edits survive a reload, same read-time-default pattern as
  // cpW/wPrimeJ above for pre-P7 docs that predate this field.
  gearInventory: { chainring: number; cog: number }[]
  // Structured kit taxonomy (owner request 2026-07 round 4, item 3): sections (Helmet,
  // Suit, …) each holding the owner's named equipment, so the same item is selectable
  // across rides without spelling drift. Fully editable; same read-time-default backfill
  // pattern as the fields above.
  kitTaxonomy: { section: string; items: string[] }[]
  // Per-page text overrides (owner request 2026-07 round 4, item 15): editable box titles/
  // subtitles, keyed by a stable per-string id. Missing key = the built-in default text.
  textOverrides: Record<string, string>
}

export const SETTINGS_ID = 'settings'

export const DEFAULT_GEAR_INVENTORY: Settings['gearInventory'] = [
  { chainring: 59, cog: 14 },
  { chainring: 60, cog: 14 },
  { chainring: 64, cog: 15 },
  { chainring: 65, cog: 15 },
]

export const DEFAULT_KIT_TAXONOMY: Settings['kitTaxonomy'] = [
  { section: 'Helmet', items: [] },
  { section: 'Suit', items: [] },
  { section: 'Shoes', items: [] },
  { section: 'Socks', items: [] },
  { section: 'Gloves', items: [] },
  { section: 'Wheels', items: [] },
  { section: 'Other', items: [] },
]

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
  gearInventory: DEFAULT_GEAR_INVENTORY,
  kitTaxonomy: DEFAULT_KIT_TAXONOMY,
  textOverrides: {},
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
  /**
   * Local time-of-day the effort started, 'HH:MM' 24 h (owner request 2026-07 round 4,
   * item 4) — the same-day ordering tiebreaker. Prefilled from the .fit file's first
   * timestamp on upload (converted to the device's local zone), editable afterwards.
   * Absent on rides saved before the field existed.
   */
  startTime?: string
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
   * Per-ride physics parameters (owner request 2026-07 round 4, item 7). Each defaults to
   * the global Settings value when absent — rides saved before these fields existed, or
   * where the owner never overrode them, keep following the global. Setting a value here
   * freezes THAT ride to it (analysis re-derives with the per-ride value).
   */
  tyreCrr?: number
  mechEfficiency?: number
  rolloutM?: number
  /**
   * Owner-recorded average power for rides with no attached .fit file (SPEC §3.6 CSV
   * import lists "avg power" as a mapped column, but there's no per-second data to derive
   * it from without a file). Ignored once a real analysis exists — `analysis` is
   * engine-derived and always takes priority for display.
   */
  manualAvgPowerW?: number
  /**
   * 'cadence' = the file's speed channel was broken (aliased SRM speed), and speed +
   * distance are reconstructed from cadence × development (rollout × chainring/cog) on
   * every analysis — chosen at upload (owner request 2026-07 round 5). Absent = trust the
   * recorded speed, as always. Fixed gear, so the reconstruction is exact up to
   * integer-rpm rounding; the ride's own gear/rollout fields drive it.
   */
  speedSource?: 'cadence'
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
    // Owner extension to §3.4 (2026-07 item 12): when set alongside avgPowerW, the
    // scenario uses the start-split model — lap 1 takes exactly startLapS, and the sim
    // covers the remaining laps at flat avgPowerW starting from the settle speed.
    startLapS?: number
  }
  result?: { predictedTimeS: number; lapSplits: number[]; note: string }
  pinned: boolean
}

/**
 * Sort key for ride ordering (owner request 2026-07 round 4, item 4): date first, then
 * the optional start time as the same-day tiebreaker (rides without one sort before timed
 * rides that day, keeping pre-field behavior stable). Compare with localeCompare.
 */
export function rideDateTimeKey(ride: Pick<Ride, 'date' | 'startTime'>): string {
  return `${ride.date}T${ride.startTime ?? '00:00'}`
}

/** Descending date+time comparator (newest first) — the app's default ride ordering. */
export function compareRidesNewestFirst(a: Pick<Ride, 'date' | 'startTime'>, b: Pick<Ride, 'date' | 'startTime'>): number {
  return rideDateTimeKey(b).localeCompare(rideDateTimeKey(a))
}

// §3.5 Event (Watts-to-Win)
export interface Event extends Persisted {
  name: string
  date: string
  venueId: string
  winners: { round: string; name: string; timeS: number }[]
  myRideIds: string[]
}

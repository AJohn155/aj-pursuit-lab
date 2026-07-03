// Data model per SPEC.md §3. All persisted objects carry id/createdAt/updatedAt (ISO strings).

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
  kit: string[]
  notes: string
  flags: { outdoor: boolean; caughtRider: boolean; interrupted: boolean }
  result?: string
  fitFileB64?: string
  analysis?: unknown
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

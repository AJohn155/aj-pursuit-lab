// Resolves a ride's effective air density from whatever inputs it was saved with (SPEC
// §3.3: direct `airDensity` measurement, or T/P/RH via §4.2). When nothing was measured,
// the fallback is the venue-altitude estimate (owner request 2026-07 round 10 — the flat
// reference made altitude venues look artificially slow in normalized time) for venues
// meaningfully above sea level, else the reference density in Settings. `densityKnown`
// stays false for BOTH estimates — the quality badge must always flag an unmeasured
// density — and `source` says which fallback was used so the UI can label it.

import { airDensity, densityFromAltitude } from '../engine/atmosphere'
import type { Ride, Settings, Venue } from './types'

/** Below this, the ISA correction is within the noise of the unknown temperature/RH, and
 * the owner's historical 1.15 reference (his long-standing convention) is kept. */
const ALTITUDE_ESTIMATE_MIN_M = 300

export type DensitySource = 'measured' | 'tprh' | 'altitude' | 'reference'

/** The density used when a ride has NO measurement — venue-altitude estimate when the
 * venue sits meaningfully above sea level, else the Settings reference. Shared by ride
 * resolution and the upload form's "don't know" mode. */
export function fallbackDensity(
  settings: Settings,
  venue?: Venue,
): { rho: number; source: 'altitude' | 'reference' } {
  if (venue != null && Number.isFinite(venue.altitudeM) && venue.altitudeM >= ALTITUDE_ESTIMATE_MIN_M) {
    return { rho: densityFromAltitude(venue.altitudeM), source: 'altitude' }
  }
  return { rho: settings.referenceAirDensity, source: 'reference' }
}

export function resolveRideDensity(
  ride: Ride,
  settings: Settings,
  venue?: Venue,
): { rho: number; densityKnown: boolean; source: DensitySource } {
  if (ride.airDensity != null) return { rho: ride.airDensity, densityKnown: true, source: 'measured' }
  if (ride.tempC != null && ride.pressureHPa != null && ride.humidityPct != null) {
    return {
      rho: airDensity(ride.tempC, ride.pressureHPa, ride.humidityPct),
      densityKnown: true,
      source: 'tprh',
    }
  }
  return { densityKnown: false, ...fallbackDensity(settings, venue) }
}

// Resolves a ride's effective air density from whatever inputs it was saved with (SPEC
// §3.3: direct `airDensity` measurement, or T/P/RH via §4.2), falling back to the
// reference density in Settings. `densityKnown` feeds the §4.16 quality badge.

import { airDensity } from '../engine/atmosphere'
import type { Ride, Settings } from './types'

export function resolveRideDensity(ride: Ride, settings: Settings): { rho: number; densityKnown: boolean } {
  if (ride.airDensity != null) return { rho: ride.airDensity, densityKnown: true }
  if (ride.tempC != null && ride.pressureHPa != null && ride.humidityPct != null) {
    return { rho: airDensity(ride.tempC, ride.pressureHPa, ride.humidityPct), densityKnown: true }
  }
  return { rho: settings.referenceAirDensity, densityKnown: false }
}

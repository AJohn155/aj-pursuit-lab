// Re-runs the full P3/P4 analysis pipeline for an already-saved Ride, sourcing raw .fit
// bytes back out of `fitFileB64` and current Settings/Venue for the physics parameters —
// the "recomputed on demand" path SPEC §3.3 describes for `Ride.analysis`. Used by the
// ride-detail page, which needs the rich per-second diagnostics (traces, overlay, rolling
// CdA, W′bal curve) that aren't part of the compact persisted AnalysisResult.

import { analyzeRideFull } from '../engine/ingest'
import type { FullRideAnalysis } from '../engine/ingest'
import { effectiveCrr, makeTrack } from '../engine/index'
import type { RiderParams } from '../engine/index'
import { base64ToBytes } from './encoding'
import { resolveRideDensity } from './density'
import { withSettingsDefaults, type Ride, type Settings, type Venue } from './types'

export function analyzeStoredRide(ride: Ride, venue: Venue, rawSettings: Settings): FullRideAnalysis {
  if (!ride.fitFileB64) {
    throw new Error('This ride has no attached .fit file to analyze.')
  }
  // Backfill fields added after this doc was created (see store/types.ts) — an old doc's
  // missing cpW/wPrimeJ would otherwise flow into wPrimeBalance as undefined → NaN.
  const settings = withSettingsDefaults(rawSettings)
  const fitBytes = base64ToBytes(ride.fitFileB64)
  const { rho, densityKnown } = resolveRideDensity(ride, settings)
  const track = makeTrack(venue.lapLengthM, venue.bendRadiusM)
  const params: RiderParams = {
    massKg: ride.systemMassKg,
    rotatingMassEqKg: settings.rotatingMassEqKg,
    crrEff: effectiveCrr(settings.tyreCrr, venue.surfaceFactor),
    mechEfficiency: settings.mechEfficiency,
    comHeightM: settings.comHeightM,
  }
  const cpW = { cp: settings.cpW, wPrimeJ: settings.wPrimeJ }

  return analyzeRideFull(fitBytes, {
    officialTimeS: ride.officialTimeS,
    officialSplits: ride.officialSplits.length > 0 ? ride.officialSplits : undefined,
    rho,
    params,
    track,
    cpW,
    densityKnown,
  })
}

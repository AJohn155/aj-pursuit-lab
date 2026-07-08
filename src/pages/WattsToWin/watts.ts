// Shared watts-to-beat math for the Watts-to-Win page (records table + watts-gap chart).
//
// Owner bug, 2026-07 round 4 item 14: with a "winner" entered at EXACTLY the owner's own
// official time, the table still said "+19 W to beat". Cause: the solved settle power (a
// model quantity — flat power from at-speed after the actual start lap) was compared
// against the ride's *recorded* power-excl-lap-1. Those differ by the model's reproduction
// bias plus the real ride's pacing shape, so the difference never goes to zero even for
// identical times. Fix: compare model-to-model — solve the settle power for the winner's
// time AND for the owner's own official time with the same start lap, and report the
// difference. Identical times now give ~0 W (−0.4 W for the 0.1 s "beat" margin).

import { solveSettlePowerForTime } from '../../engine/startsplit'
import { analyzeStoredRide } from '../../store/analyzeStoredRide'
import { resolveScenario } from '../../store/scenario'
import type { ResolvedScenario } from '../../store/scenario'
import { displayPowerExclLap1 } from '../Rides/format'
import type { Ride, Settings, Venue } from '../../store/types'

export interface RideModel {
  ride: Ride
  resolved: ResolvedScenario
  /** The ride's actual first-lap time — official split when present, else constructed. */
  startLapS: number
  /** Settle power at which the model reproduces the ride's own official time. */
  modelSettleW: number
  /** The ride's recorded "power excluding lap 1" — display context only. */
  actualExclLap1W: number | null
}

/** Builds the per-ride model shared by the records table and the watts-gap chart. */
export function buildRideModel(
  ride: Ride,
  venues: Venue[],
  settings: Settings,
): { model: RideModel } | { error: string } {
  const venue = venues.find((v) => v.id === ride.venueId)
  if (!venue) return { error: 'venue no longer exists' }
  if (!ride.fitFileB64) return { error: 'no .fit file attached' }
  try {
    const full = analyzeStoredRide(ride, venue, settings)
    const resolved = resolveScenario({ ride, venue, full }, {}, settings, venues)
    const startLapS = ride.officialSplits[0] ?? full.analysisResult.laps[0]?.timeS
    if (startLapS == null || !Number.isFinite(startLapS)) return { error: 'no usable first-lap time' }
    const modelSettleW = settleForTime(ride.officialTimeS, startLapS, resolved)
    if (modelSettleW == null) return { error: "couldn't reproduce the ride's own time in the model" }
    return {
      model: {
        ride,
        resolved,
        startLapS,
        modelSettleW,
        actualExclLap1W: displayPowerExclLap1(full.analysisResult),
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

/** Settle power that produces `targetTimeS` with the ride's own start lap held fixed. */
export function settleForTime(targetTimeS: number, startLapS: number, resolved: ResolvedScenario): number | null {
  try {
    return solveSettlePowerForTime(targetTimeS, startLapS, {
      cdaM2: resolved.cdaM2,
      rho: resolved.rho,
      params: resolved.params,
      track: resolved.track,
    })
  } catch {
    return null
  }
}

export interface WattsToBeat {
  /** Extra settle watts vs the model's reproduction of the owner's own time. ~0 when the
   * times are identical — the number the owner actually asked for. */
  deltaW: number
  /** Absolute settle power that beats the winner (context). */
  settleW: number
}

/** Watts to BEAT the winner (finish 0.1 s inside their time), same start lap as ridden. */
export function wattsToBeat(winnerTimeS: number, model: RideModel): WattsToBeat | null {
  const settleW = settleForTime(winnerTimeS - 0.1, model.startLapS, model.resolved)
  if (settleW == null) return null
  return { deltaW: settleW - model.modelSettleW, settleW }
}

// Density normalization, SPEC §4.12.
//
// Fast mode: steady-lap times scale by (ρ_target/ρ_ride)^(1/3); lap 1 by the blended
// (((ρ_target/ρ_ride)+2)/3)^(1/3). Full mode: re-simulate at the target density with the
// ride's power. Default display is fast mode (reference ρ = 1.15), for continuity with
// the owner's historical numbers.

import { densityScaleLap1, densityScaleSteady } from './atmosphere'
import { simulate } from './simulate'
import type { SolveBase } from './solve'

/**
 * Fast-mode normalization of a lap-time vector from ρ_ride to ρ_target (SPEC §4.12).
 * When `firstIsLap1` (default true), the first element uses the standing-start lap-1
 * scale and the rest use the steady scale. Set false for a pure steady-lap vector
 * (e.g. the time-adjuster calculator's gate-7c case).
 */
export function normalizeLapTimesFast(
  lapTimesS: number[],
  rhoRide: number,
  rhoTarget: number,
  firstIsLap1 = true,
): number[] {
  const steady = densityScaleSteady(rhoTarget, rhoRide)
  const lap1 = densityScaleLap1(rhoTarget, rhoRide)
  return lapTimesS.map((lt, i) => lt * (firstIsLap1 && i === 0 ? lap1 : steady))
}

/**
 * Full-mode normalization (SPEC §4.12): re-simulate the ride's power at the target
 * density and return the new finish time. `base` carries the ride's power/CdA/params;
 * only ρ is swapped to the target.
 */
export function normalizeTimeFull(base: SolveBase, rhoTarget: number): number {
  return simulate({ ...base, rho: rhoTarget }).finishTimeS
}

/**
 * Equivalent finish time at a reference density (SPEC §4.9 `equivalentTimeAtRefDensity`),
 * fast mode: total time scaled by the steady factor. (Whole-ride equivalent; lap-1
 * blending is applied per-lap by normalizeLapTimesFast when a lap vector is available.)
 */
export function equivalentTimeAtRefDensity(
  totalTimeS: number,
  rhoRide: number,
  rhoRef: number,
): number {
  return totalTimeS * densityScaleSteady(rhoRef, rhoRide)
}

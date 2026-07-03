// Track position model, SPEC §4.3.
//
// Within one lap of length L: two straights (each S) and two bends (each πR at the
// datum). Transition spirals are ignored (accepted approximation, §4.3). On the
// straights the lean/normal/wheel-speed factors are all 1; only bends modulate them.

import { G } from './constants'
import type { TrackModel } from './types'

/** Bend fraction of the lap, fBend = 2πR/L (SPEC §4.3). */
export function bendFraction(track: TrackModel): number {
  return (2 * Math.PI * track.bendRadiusM) / track.lapLengthM
}

/**
 * Build a geometrically-consistent track from L and R by deriving the straight length
 * that closes the constraint L = 2S + 2πR (SPEC §3.2). The engine's bend classification
 * assumes a closing geometry; venues whose published S/R don't close are reconciled by
 * the store (§3.2 residual) before analysis, or via this helper for synthetic tests.
 */
export function makeTrack(lapLengthM: number, bendRadiusM: number): TrackModel {
  const straightLengthM = (lapLengthM - 2 * Math.PI * bendRadiusM) / 2
  return { lapLengthM, bendRadiusM, straightLengthM }
}

/**
 * True when position-in-lap s (m) falls in a bend. Lap layout: straight [0,S), bend
 * [S,S+πR), straight [S+πR,2S+πR), bend [2S+πR,L). s is wrapped into [0,L).
 * If the passed geometry doesn't close, the final tail is treated as bend.
 */
export function isBend(s: number, track: TrackModel): boolean {
  const L = track.lapLengthM
  const S = track.straightLengthM
  const arc = Math.PI * track.bendRadiusM
  const p = ((s % L) + L) % L
  if (p < S) return false
  if (p < S + arc) return true
  if (p < 2 * S + arc) return false
  return true
}

/** Lean angle at COM speed v in a bend: θ = atan(v²/(g·R)) (SPEC §4.3). */
export function leanAngle(vCom: number, R: number): number {
  return Math.atan((vCom * vCom) / (G * R))
}

/** Normal-force multiplier in a bend: kN = √(1+(v²/(g·R))²) = 1/cos θ (SPEC §4.3). */
export function normalForceMultiplier(vCom: number, R: number): number {
  const a = (vCom * vCom) / (G * R)
  return Math.sqrt(1 + a * a)
}

/**
 * Wheel-speed / COM-speed ratio in a bend, kV = Rw/R with Rw = R + comHeight·sin θ
 * (SPEC §4.3). The leaned bike's contact patch traces a larger radius than the COM on
 * the datum, so the wheel (and thus wheel-derived file speed) runs faster than the COM.
 */
export function wheelSpeedRatio(vCom: number, R: number, comHeightM: number): number {
  const theta = leanAngle(vCom, R)
  const Rw = R + comHeightM * Math.sin(theta)
  return Rw / R
}

export interface CornerFactors {
  inBend: boolean
  /** Lean angle θ (rad); 0 on straights. */
  theta: number
  /** Normal-force multiplier kN; 1 on straights. */
  kN: number
  /** Wheel/COM speed ratio kV; 1 on straights. */
  kV: number
}

/** Corner factors at a given COM speed and position-in-lap. On straights all are unity. */
export function cornerFactors(
  vCom: number,
  s: number,
  track: TrackModel,
  comHeightM: number,
): CornerFactors {
  if (!isBend(s, track)) return { inBend: false, theta: 0, kN: 1, kV: 1 }
  const R = track.bendRadiusM
  const theta = leanAngle(vCom, R)
  const a = (vCom * vCom) / (G * R)
  const kN = Math.sqrt(1 + a * a)
  const kV = (R + comHeightM * Math.sin(theta)) / R
  return { inBend: true, theta, kN, kV }
}

/**
 * Invert the file's wheel speed to the COM speed at a position (SPEC §4.9 uses
 * v_com = v_wheel / kV(v,s)). kV is defined in terms of COM speed via the lean angle,
 * so this is a fixed-point inversion. It converges in a few iterations because kV is
 * within ~3 % of 1 at racing speed (h·sinθ ≪ R). This iteration is a documented
 * modelling choice — the spec defines the relationship but not the inversion procedure.
 * On straights kV=1 so v_com = v_wheel exactly.
 */
export function comSpeedFromWheel(
  vWheel: number,
  s: number,
  track: TrackModel,
  comHeightM: number,
  iters = 6,
): number {
  if (!isBend(s, track)) return vWheel
  let vCom = vWheel
  for (let i = 0; i < iters; i++) {
    const kV = wheelSpeedRatio(vCom, track.bendRadiusM, comHeightM)
    vCom = vWheel / kV
  }
  return vCom
}

/**
 * Lap-averaged effective Crr multiplier at COM speed v: kCrrLap = (1−fBend)+fBend·kN
 * (SPEC §4.3). Applied to crrEff for lap-averaged rolling estimates.
 */
export function lapCrrMultiplier(vCom: number, track: TrackModel): number {
  const f = bendFraction(track)
  return (1 - f) + f * normalForceMultiplier(vCom, track.bendRadiusM)
}

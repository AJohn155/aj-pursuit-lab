// Cadence-derived speed fallback (owner request 2026-07 round 5).
//
// Some SRM files carry a broken/aliased speed channel — e.g. the 2025-04-04 PM9 file
// records every 5 s and its speed jumps 6→16 m/s sample-to-sample while cadence and power
// are clean. On a fixed-gear track bike the wheel is rigidly geared to the cranks, so
// cadence × development IS the wheel speed (development = rollout × chainring/cog);
// reconstruction is exact up to integer-rpm rounding. The cumulative distance channel is
// re-integrated too — the head unit derives it from the same broken speed.

import type { FitRecord } from './types'

export interface SpeedChannelAssessment {
  /** True when the speed channel is inconsistent with cadence and should not be trusted. */
  broken: boolean
  /**
   * Robust spread (IQR ÷ median) of the per-record speed/cadence ratio. On a fixed gear
   * that ratio is a constant (development ÷ 60), so healthy files sit ≈0.01–0.03; the
   * broken PM9 file is ≈0.3.
   */
  ratioSpread: number
  /** Records that qualified for the ratio (moving, pedalling). */
  sampleCount: number
}

/** Ratio-eligibility gates: only steady pedalling at speed, where the fixed-gear
 * speed/cadence lock must hold. */
const MIN_CADENCE_RPM = 60
const MIN_SPEED_MS = 5
const MIN_SAMPLES = 10
/** Healthy fixed-gear files sit well under 0.05; aliased channels are several times that. */
const SPREAD_THRESHOLD = 0.1

/**
 * Judge the speed channel against cadence WITHOUT knowing the gear: on a fixed gear
 * speed/cadence is a constant, so its spread alone separates a healthy channel from a
 * broken one.
 */
export function assessSpeedChannel(records: FitRecord[]): SpeedChannelAssessment {
  const ratios = records
    .filter((r) => (r.cadenceRpm ?? 0) >= MIN_CADENCE_RPM && r.speedMs >= MIN_SPEED_MS)
    .map((r) => r.speedMs / (r.cadenceRpm as number))
    .sort((a, b) => a - b)
  if (ratios.length < MIN_SAMPLES) return { broken: false, ratioSpread: 0, sampleCount: ratios.length }
  const q = (f: number) => ratios[Math.round(f * (ratios.length - 1))]
  const median = q(0.5)
  const ratioSpread = median > 0 ? (q(0.75) - q(0.25)) / median : 0
  return { broken: ratioSpread > SPREAD_THRESHOLD, ratioSpread, sampleCount: ratios.length }
}

/** Distance covered per crank revolution, m: wheel rollout × gear ratio. */
export function developmentM(rolloutM: number, chainring: number, cog: number): number {
  return (rolloutM * chainring) / cog
}

/**
 * Replace the speed and distance channels with cadence-derived values: v = cadence/60 ×
 * development; distance re-integrated trapezoidally over the record times (the recorded
 * distance came from the same broken speed). Power/cadence/timestamps untouched.
 */
export function reconstructSpeedFromCadence(records: FitRecord[], devM: number): FitRecord[] {
  const out: FitRecord[] = []
  let dist = 0
  let prevT = records[0]?.t ?? 0
  let prevV = 0
  for (const r of records) {
    const v = ((r.cadenceRpm ?? 0) / 60) * devM
    // Segment gaps (>5 s, the timeline split threshold) contribute nothing — only
    // within-segment distance differences are ever consumed downstream.
    const dt = r.t - prevT
    if (dt <= 5) dist += ((v + prevV) / 2) * dt
    out.push({ ...r, speedMs: v, distanceM: dist })
    prevT = r.t
    prevV = v
  }
  return out
}

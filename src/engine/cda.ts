// CdA estimation by whole-lap energy balance, SPEC §4.9.
//
//   E_in   = Σ η·P·Δt + startEnergy(if window includes start)
//   ΔKE    = 0.5·mEff·(v_b² − v_a²)          // COM speeds at boundaries
//   E_roll = Σ crrEff·massKg·g·kN(v,s)·v_com·Δt
//   E_aero = E_in − ΔKE − E_roll
//   CdA    = E_aero / Σ 0.5·ρ·v_com³·Δt
//
// v_com is the COM datum speed supplied per-sample (m/s). The wheel→COM(datum)
// conversion is done ONCE upstream, in ingest, via the §4.7 calibration factor c
// (v_com = c·v_wheel). SPEC §4.9 as written also divides wheel speed by kV(v,s), but that
// double-counts the wheel-path excess that c already absorbs (calibration is derived from
// the raw wheel distance vs the known datum), leaving the forward simulator §4.10 unable
// to reproduce the race by ~2-3%. Resolved in P3 (see PROGRESS 2026-07-03): calibration
// owns the wheel→datum conversion; the /kV term is dropped. kN (rolling normal-force lift
// in the bends) is a genuinely separate effect and is retained.

import { G } from './constants'
import { effectiveInertialMass } from './params'
import { isBend, normalForceMultiplier } from './track'
import type { RiderParams, Sample, TrackModel } from './types'

export interface CdaInput {
  /** Samples spanning an integer-lap window (default steady window: laps 3 → last full lap). */
  samples: Sample[]
  /** Air density ρ (kg/m³) for this ride. */
  rho: number
  params: RiderParams
  track: TrackModel
  /** Standing-start energy (J), added to E_in only when the window covers the start (§4.6). */
  startEnergyJ?: number
  /**
   * Boundary speeds for the ΔKE term averaged over this many samples at each window edge
   * (default 1 = exact spec form, used by the gated cdaRace/per-lap paths). The rolling
   * diagnostic passes >1: ΔKE goes as v·Δv, so a single noisy 1 Hz edge sample is worth
   * ~0.002 m² of CdA in a 2-lap window — most of its visible spikiness (owner question
   * 2026-07).
   */
  edgeSmoothSamples?: number
}

export interface CdaBreakdown {
  cdaM2: number
  /** Σ η·P·Δt (+ startEnergy). */
  eInJ: number
  /** 0.5·mEff·(v_b²−v_a²). */
  dKeJ: number
  /** Σ crrEff·massKg·g·kN·v_com·Δt. */
  eRollJ: number
  /** E_in − ΔKE − E_roll. */
  eAeroJ: number
  /** Σ 0.5·ρ·v_com³·Δt (the aero denominator). */
  aeroDenomJ: number
  vComStartMs: number
  vComEndMs: number
}

/**
 * Energy-balance CdA over one integer-lap window. Returns the full breakdown so the UI
 * (and the worked example) can show where the energy goes, not just the final CdA.
 */
export function energyBalanceCda(input: CdaInput): CdaBreakdown {
  const { samples, rho, params, track, startEnergyJ = 0, edgeSmoothSamples = 1 } = input
  if (samples.length === 0) throw new Error('energyBalanceCda: empty sample window')

  const mEff = effectiveInertialMass(params)
  const eta = params.mechEfficiency

  const n = Math.max(1, Math.min(edgeSmoothSamples, Math.floor(samples.length / 2)))
  const mean = (arr: Sample[]) => arr.reduce((s, x) => s + x.vCom, 0) / arr.length
  const vComStart = mean(samples.slice(0, n))
  const vComEnd = mean(samples.slice(samples.length - n))

  let eIn = startEnergyJ
  let eRoll = 0
  let aeroDenom = 0

  for (const smp of samples) {
    const vCom = smp.vCom
    // Rolling normal-force multiplier: kN in the bends, 1 on the straights (§4.3).
    const kN = isBend(smp.s, track) ? normalForceMultiplier(vCom, track.bendRadiusM) : 1
    eIn += eta * smp.powerW * smp.dt
    eRoll += params.crrEff * params.massKg * G * kN * vCom * smp.dt
    aeroDenom += 0.5 * rho * vCom * vCom * vCom * smp.dt
  }

  const dKe = 0.5 * mEff * (vComEnd * vComEnd - vComStart * vComStart)
  const eAero = eIn - dKe - eRoll
  const cdaM2 = eAero / aeroDenom

  return {
    cdaM2,
    eInJ: eIn,
    dKeJ: dKe,
    eRollJ: eRoll,
    eAeroJ: eAero,
    aeroDenomJ: aeroDenom,
    vComStartMs: vComStart,
    vComEndMs: vComEnd,
  }
}

/** Per-lap CdA (each single lap), SPEC §4.9 `cdaPerLap[]`. */
export function cdaPerLap(
  laps: Sample[][],
  rho: number,
  params: RiderParams,
  track: TrackModel,
): number[] {
  return laps.map((samples) => energyBalanceCda({ samples, rho, params, track }).cdaM2)
}

/**
 * 95 % CI half-width from lap-to-lap CdA scatter (SPEC §4.9 "95 % CI from lap-to-lap
 * scatter"). Normal approximation: 1.96·(sample SD / √n). Documented choice — the spec
 * asks for a 95 % CI from scatter but not a specific estimator; a t-multiplier would be
 * marginally wider for the ~13-lap window but the normal approx keeps the engine
 * dependency-free and is standard for this reporting.
 */
export function ci95FromScatter(perLap: number[]): number {
  const n = perLap.length
  if (n < 2) return 0
  const mean = perLap.reduce((a, b) => a + b, 0) / n
  const variance = perLap.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (n - 1)
  const sd = Math.sqrt(variance)
  return 1.96 * (sd / Math.sqrt(n))
}

export interface CdaRaceResult {
  /** Energy-balance CdA over the whole steady window (SPEC §4.9 cdaRace). */
  cdaRace: number
  /** 95 % CI half-width from lap-to-lap scatter. */
  ci95: number
  /** Per-lap CdA. */
  perLap: number[]
  /** Full energy breakdown of the steady window. */
  breakdown: CdaBreakdown
}

/**
 * cdaRace over a steady window given as per-lap sample groups. cdaRace is the energy
 * balance over the concatenated window (not the mean of per-lap CdAs); the CI comes from
 * the per-lap distribution (SPEC §4.9).
 */
export function cdaRace(
  laps: Sample[][],
  rho: number,
  params: RiderParams,
  track: TrackModel,
): CdaRaceResult {
  const samples = laps.flat()
  const breakdown = energyBalanceCda({ samples, rho, params, track })
  const perLap = cdaPerLap(laps, rho, params, track)
  return { cdaRace: breakdown.cdaM2, ci95: ci95FromScatter(perLap), perLap, breakdown }
}

/** Sanity range for CdA (SPEC §4.9): outside → quality flag, still displayed. */
export const CDA_SANE_MIN = 0.16
export const CDA_SANE_MAX = 0.26

export interface RollingCdaPoint {
  /** Distance from race start at the window center, m. */
  centerDistM: number
  cdaM2: number
}

/**
 * Rolling CdA (SPEC §4.9 `cdaRolling`): centered ~1-lap window, step ¼ lap, over a
 * continuous distance axis. Display-only diagnostic — shows drift/noise within the race
 * that the single `cdaRace` window averages away. `samples`/`distCumM` are a
 * time-ordered pair (same length): samples with a cumulative datum distance from the race
 * start (see ingest/laps.ts `raceSampleSeries`).
 */
export function cdaRolling(
  samples: Sample[],
  distCumM: number[],
  rho: number,
  params: RiderParams,
  track: TrackModel,
  windowM: number = track.lapLengthM,
  stepM: number = track.lapLengthM / 4,
): RollingCdaPoint[] {
  if (samples.length !== distCumM.length) {
    throw new Error('cdaRolling: samples and distCumM must be the same length')
  }
  if (samples.length === 0) return []

  const dMin = distCumM[0]
  const dMax = distCumM[distCumM.length - 1]
  const points: RollingCdaPoint[] = []

  for (let center = dMin + windowM / 2; center + windowM / 2 <= dMax; center += stepM) {
    const lo = center - windowM / 2
    const hi = center + windowM / 2
    const windowSamples: Sample[] = []
    for (let i = 0; i < samples.length; i++) {
      if (distCumM[i] >= lo && distCumM[i] < hi) windowSamples.push(samples[i])
    }
    if (windowSamples.length < 2) continue
    // Edge smoothing (5 samples ≈ 5 s) damps the boundary-ΔKE noise that dominates short
    // windows — see edgeSmoothSamples on CdaInput. Display-only path.
    const cdaM2 = energyBalanceCda({ samples: windowSamples, rho, params, track, edgeSmoothSamples: 5 }).cdaM2
    points.push({ centerDistM: center, cdaM2 })
  }
  return points
}

export function cdaInSaneRange(cdaM2: number): boolean {
  return cdaM2 >= CDA_SANE_MIN && cdaM2 <= CDA_SANE_MAX
}

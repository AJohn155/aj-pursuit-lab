// CdA estimation by whole-lap energy balance, SPEC §4.9.
//
//   E_in   = Σ η·P·Δt + startEnergy(if window includes start)
//   ΔKE    = 0.5·mEff·(v_b² − v_a²)          // COM speeds at boundaries
//   E_roll = Σ crrEff·massKg·g·kN(v,s)·v_com·Δt
//   E_aero = E_in − ΔKE − E_roll
//   CdA    = E_aero / Σ 0.5·ρ·v_com³·Δt
//
// v_com = v_wheel / kV(v,s) sample-by-sample; kN(v,s) and kV(v,s) come from §4.3.

import { G } from './constants'
import { effectiveInertialMass } from './params'
import { comSpeedFromWheel, cornerFactors } from './track'
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
  const { samples, rho, params, track, startEnergyJ = 0 } = input
  if (samples.length === 0) throw new Error('energyBalanceCda: empty sample window')

  const mEff = effectiveInertialMass(params)
  const eta = params.mechEfficiency

  const first = samples[0]
  const last = samples[samples.length - 1]
  const vComStart = comSpeedFromWheel(first.vWheel, first.s, track, params.comHeightM)
  const vComEnd = comSpeedFromWheel(last.vWheel, last.s, track, params.comHeightM)

  let eIn = startEnergyJ
  let eRoll = 0
  let aeroDenom = 0

  for (const smp of samples) {
    const vCom = comSpeedFromWheel(smp.vWheel, smp.s, track, params.comHeightM)
    const { kN } = cornerFactors(vCom, smp.s, track, params.comHeightM)
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

export function cdaInSaneRange(cdaM2: number): boolean {
  return cdaM2 >= CDA_SANE_MIN && cdaM2 <= CDA_SANE_MAX
}

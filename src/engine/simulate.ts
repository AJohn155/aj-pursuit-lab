// Forward simulator, SPEC §4.10.
//
// State (s, v_com) integrated at dt = 0.1 s over the track model:
//   dv/dt = ( η·P(t,s)/v − 0.5·ρ·CdA·v² − crrEff·massKg·g·kN(v,s) ) / mEff
//   ds/dt = v                                   (progress along the datum line)
//
// v is COM speed throughout (kV only matters when reading wheel-derived file speed;
// the simulator integrates the COM directly). Lap splits are datum-line crossings.

import { G } from './constants'
import { effectiveInertialMass } from './params'
import { cornerFactors } from './track'
import type { RiderParams, TrackModel } from './types'

/** Power source: a constant (W) or a schedule P(t,s). */
export type PowerInput = number | ((t: number, s: number) => number)

export interface SimInput {
  power: PowerInput
  cdaM2: number
  rho: number
  params: RiderParams
  track: TrackModel
  /** Total datum distance to cover, m (default 4000 = 16×250). */
  distanceM?: number
  /** Integration step, s (default 0.1 per §4.10). */
  dt?: number
  /** Initial COM speed, m/s (default 0.5 — the standing-start value in §4.10). */
  v0?: number
  /** Hard guard on simulated time, s (default 900). Prevents runaway if power is too low. */
  maxTimeS?: number
}

export interface SimResult {
  /** Time to cover distanceM, s (interpolated within the final step). */
  finishTimeS: number
  /** Cumulative time at each lap line n·L (interpolated), length = distanceM/L. */
  lapSplits: number[]
  /** Per-lap times (successive differences of lapSplits). */
  lapTimes: number[]
  /** Full trajectory at the integration step. */
  samples: { t: number; s: number; v: number; p: number }[]
  /** True if the sim hit maxTimeS before finishing (power too low to complete). */
  timedOut: boolean
}

/**
 * Speed floor used only inside the propulsion term η·P/v to avoid the v→0 singularity
 * at the standing start. The datum start speed is 0.5 m/s (§4.10); the floor is below
 * that so it never distorts a running simulation, only guards the first instants.
 */
const PROP_V_FLOOR = 0.3

/**
 * Max |acceleration| per step, m/s². A documented guard so an aggressive start-power
 * template at very low speed can't blow the explicit integrator up; real standing-start
 * accelerations are well under this, so it doesn't clip physical trajectories.
 */
const MAX_ACCEL = 12

function powerAt(power: PowerInput, t: number, s: number): number {
  return typeof power === 'function' ? power(t, s) : power
}

/**
 * Default standing-start power template (SPEC §4.10 fallback): 3 s linear ramp from 0
 * to 1.3× steady, linear decay back to steady by t = 20 s, steady thereafter. Used when
 * no rider-specific start template has been learned yet.
 */
export function defaultStartPower(steadyW: number): (t: number) => number {
  return (t: number) => {
    if (t <= 3) return steadyW * 1.3 * (t / 3)
    if (t <= 20) return steadyW * (1.3 - 0.3 * ((t - 3) / 17))
    return steadyW
  }
}

/**
 * Integrate the forward model. Semi-implicit (symplectic) Euler at dt: acceleration is
 * evaluated at the current speed, speed is advanced, then position is advanced with the
 * new speed. This is the §4.10 "integrated at dt=0.1 s" scheme, chosen semi-implicit for
 * stability near the start without changing the specified step.
 */
export function simulate(input: SimInput): SimResult {
  const {
    power,
    cdaM2,
    rho,
    params,
    track,
    distanceM = 4000,
    dt = 0.1,
    v0 = 0.5,
    maxTimeS = 900,
  } = input

  const mEff = effectiveInertialMass(params)
  const eta = params.mechEfficiency
  const L = track.lapLengthM
  const nLaps = Math.round(distanceM / L)

  const samples: SimResult['samples'] = []
  const lapSplits: number[] = []

  let t = 0
  let s = 0
  let v = v0
  samples.push({ t, s, v, p: powerAt(power, t, s) })

  let nextLapDist = L
  let timedOut = false

  while (s < distanceM) {
    const p = powerAt(power, t, s)
    const { kN } = cornerFactors(v, s, track, params.comHeightM)
    const prop = (eta * p) / Math.max(v, PROP_V_FLOOR)
    const aero = 0.5 * rho * cdaM2 * v * v
    const roll = params.crrEff * params.massKg * G * kN
    let a = (prop - aero - roll) / mEff
    if (a > MAX_ACCEL) a = MAX_ACCEL
    if (a < -MAX_ACCEL) a = -MAX_ACCEL

    const vPrev = v
    const sPrev = s
    v = Math.max(v + a * dt, 0.05) // keep strictly positive so propulsion stays finite
    s = s + v * dt
    t += dt

    // Interpolate lap-line crossings within this step (linear in s over the step).
    while (nextLapDist <= distanceM && s >= nextLapDist && lapSplits.length < nLaps) {
      const frac = (nextLapDist - sPrev) / (s - sPrev)
      lapSplits.push(t - dt + frac * dt)
      nextLapDist += L
    }

    samples.push({ t, s, v, p })

    if (t >= maxTimeS) {
      timedOut = true
      break
    }
    // Guard against a stalled sim (speed collapsed and not recovering).
    if (v <= 0.06 && vPrev <= 0.06 && t > 1) {
      timedOut = true
      break
    }
  }

  // Finish time = crossing of distanceM (last lap split if it landed exactly there,
  // else interpolate from the final pair of samples).
  let finishTimeS: number
  if (lapSplits.length === nLaps) {
    finishTimeS = lapSplits[nLaps - 1]
  } else if (samples.length >= 2) {
    const b = samples[samples.length - 1]
    const a2 = samples[samples.length - 2]
    if (b.s >= distanceM && b.s !== a2.s) {
      const frac = (distanceM - a2.s) / (b.s - a2.s)
      finishTimeS = a2.t + frac * dt
    } else {
      finishTimeS = b.t
    }
  } else {
    finishTimeS = t
  }

  const lapTimes = lapSplits.map((split, i) => (i === 0 ? split : split - lapSplits[i - 1]))

  return { finishTimeS, lapSplits, lapTimes, samples, timedOut }
}

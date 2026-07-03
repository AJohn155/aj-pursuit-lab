// Shared synthetic-data builders for engine tests. Not a *.test.ts file, so vitest does
// not run it directly. These construct exactly-known scenarios so tests can assert that
// the engine recovers the ground truth (the synthetic form of fixture gates 4 & 5, which
// use real .fit data in P3).

import { G } from '../constants'
import { isBend, normalForceMultiplier } from '../track'
import type { SimResult } from '../simulate'
import type { RiderParams, Sample, TrackModel } from '../types'

/** Owner's default rider parameters (SPEC §3.1), as engine RiderParams. */
export const DEFAULT_PARAMS: RiderParams = {
  massKg: 100,
  rotatingMassEqKg: 1.0,
  crrEff: 0.0014, // tyreCrr 0.0014 × surfaceFactor 1.0
  mechEfficiency: 0.98,
  comHeightM: 1.1,
}

/** kN at a position: normal-force multiplier in a bend, 1 on a straight (§4.3). */
function kNAt(vCom: number, sInLap: number, track: TrackModel): number {
  return isBend(sInLap, track) ? normalForceMultiplier(vCom, track.bendRadiusM) : 1
}

/**
 * Build samples for a lap ridden at exactly constant COM speed. At each position we solve
 * the §4.10 ODE for the instantaneous power that holds v_com constant (dv/dt = 0):
 *   P = (0.5·ρ·CdA·v³ + crrEff·m·g·kN·v) / η
 * Because dv/dt = 0 and the boundary speeds are equal, the energy-balance CdA recovers
 * `cda` to machine precision.
 */
export function constantVComSamples(opts: {
  track: TrackModel
  params: RiderParams
  rho: number
  cda: number
  vCom: number
  nSamples: number
  dt?: number
}): Sample[] {
  const { track, params, rho, cda, vCom, nSamples, dt = 0.1 } = opts
  const samples: Sample[] = []
  let s = 0
  for (let i = 0; i < nSamples; i++) {
    const sInLap = s % track.lapLengthM
    const kN = kNAt(vCom, sInLap, track)
    const powerW =
      (0.5 * rho * cda * vCom ** 3 + params.crrEff * params.massKg * G * kN * vCom) /
      params.mechEfficiency
    samples.push({ dt, powerW, vCom, s: sInLap })
    s += vCom * dt
  }
  return samples
}

/**
 * Extract one interior lap from a forward-sim trajectory as energy-balance Samples. The
 * sim already integrates COM datum speed, so it maps straight onto Sample.vCom.
 */
export function lapSamplesFromSim(
  sim: SimResult,
  lapIndex: number,
  track: TrackModel,
  _params: RiderParams,
  dt = 0.1,
): Sample[] {
  const L = track.lapLengthM
  return sim.samples
    .filter((x) => x.s >= lapIndex * L && x.s < (lapIndex + 1) * L)
    .map((x) => ({ dt, powerW: x.p, vCom: x.v, s: x.s % L }))
}

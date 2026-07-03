// Pacing optimality, SPEC §4.14.
//
// Given CP/W′ and the ride's environment/CdA, grid-search a 3-parameter pacing family
// (start intensity multiplier, settle power, end-kick timing) subject to W′bal ≥ 0, and
// minimize simulated time. Report optimal vs actual: Δtime and per-lap time lost.

import { simulate } from './simulate'
import type { SimInput } from './simulate'
import { wPrimeBalance } from './wprime'

/** Base for pacing: sim inputs minus the power schedule (which the family supplies). */
export type PacingBase = Omit<SimInput, 'power'>

export interface PacingParams {
  /** Opening power = settleW · startMult over the first OPENING_LAPS laps. */
  startMult: number
  /** Steady "settle" power, W. */
  settleW: number
  /** Fraction of total distance after which the end-kick applies (1.0 = no kick). */
  endKickFrac: number
}

/**
 * Opening length in laps and the fixed end-kick multiplier. The pacing family has three
 * FREE parameters per §4.14; the opening length and kick magnitude are fixed structural
 * choices (documented) so the search space stays 3-D. OPENING_LAPS covers the standing
 * start + settle-in; KICK_MULT is a moderate final lift.
 */
const OPENING_LAPS = 1.5
const KICK_MULT = 1.1

/** Build the P(t,s) schedule for a pacing family member. Kick/opening keyed on distance. */
export function pacingPowerFn(
  p: PacingParams,
  lapLengthM: number,
  distanceM: number,
): (t: number, s: number) => number {
  const openingDist = OPENING_LAPS * lapLengthM
  const kickDist = p.endKickFrac * distanceM
  return (_t: number, s: number) => {
    if (s < openingDist) return p.settleW * p.startMult
    if (s >= kickDist) return p.settleW * KICK_MULT
    return p.settleW
  }
}

/** Is a power series feasible, i.e. W′bal never goes below 0? (SPEC §4.14 constraint.) */
export function pacingFeasible(
  powerSeries: number[],
  dt: number,
  cp: number,
  wPrime: number,
): boolean {
  const bal = wPrimeBalance({ power: powerSeries, dt, cp, wPrime })
  return bal.every((b) => b >= 0)
}

export interface PacingGrids {
  startMult?: number[]
  settleW?: number[]
  endKickFrac?: number[]
}

export interface PacingResult {
  best: PacingParams
  timeS: number
  lapTimes: number[]
  /** W′bal at the finish for the optimal schedule (≥ 0 by construction). */
  wPrimeEndJ: number
}

function defaultGrids(cp: number, grids: PacingGrids): Required<PacingGrids> {
  return {
    startMult: grids.startMult ?? [1.0, 1.1, 1.2, 1.3, 1.4, 1.5],
    settleW:
      grids.settleW ??
      [0.95, 1.0, 1.05, 1.1, 1.15].map((f) => Math.round(cp * f)),
    endKickFrac: grids.endKickFrac ?? [0.75, 0.85, 0.95, 1.0],
  }
}

/**
 * Grid-search the pacing family for the fastest feasible schedule (SPEC §4.14).
 * Returns the best parameters, its simulated time, lap times and finishing W′bal.
 * Throws if no grid member is feasible (caller should widen W′ or lower the grid).
 */
export function optimizePacing(
  base: PacingBase,
  cp: number,
  wPrime: number,
  grids: PacingGrids = {},
): PacingResult {
  const g = defaultGrids(cp, grids)
  const dt = base.dt ?? 0.1
  const distanceM = base.distanceM ?? 4000
  const L = base.track.lapLengthM

  let best: PacingResult | null = null
  for (const startMult of g.startMult) {
    for (const settleW of g.settleW) {
      for (const endKickFrac of g.endKickFrac) {
        const params: PacingParams = { startMult, settleW, endKickFrac }
        const power = pacingPowerFn(params, L, distanceM)
        const sim = simulate({ ...base, power })
        if (sim.timedOut) continue
        const series = sim.samples.map((s) => s.p)
        const bal = wPrimeBalance({ power: series, dt, cp, wPrime })
        if (!bal.every((b) => b >= 0)) continue
        if (!best || sim.finishTimeS < best.timeS) {
          best = {
            best: params,
            timeS: sim.finishTimeS,
            lapTimes: sim.lapTimes,
            wPrimeEndJ: bal[bal.length - 1],
          }
        }
      }
    }
  }
  if (!best) throw new Error('optimizePacing: no feasible schedule in the grid')
  return best
}

export interface PacingComparison {
  optimal: PacingResult
  actualTimeS: number
  actualLapTimes: number[]
  /** actual − optimal total time (s); positive means time was lost to pacing. */
  deltaTimeS: number
  /** Per-lap time lost to pacing = actualLapTimes − optimal.lapTimes. */
  timeLostPerLapS: number[]
}

/**
 * Compare an actual ride (its power series → sim) against the optimal pacing schedule
 * (SPEC §4.14). Reports Δtime and per-lap time lost. `actual` is simulated with the same
 * base so the comparison is apples-to-apples (same CdA/ρ/track/integrator).
 */
export function comparePacing(
  base: PacingBase,
  actualPower: SimInput['power'],
  cp: number,
  wPrime: number,
  grids: PacingGrids = {},
): PacingComparison {
  const optimal = optimizePacing(base, cp, wPrime, grids)
  const actualSim = simulate({ ...base, power: actualPower })
  const timeLostPerLapS = actualSim.lapTimes.map(
    (lt, i) => lt - (optimal.lapTimes[i] ?? lt),
  )
  return {
    optimal,
    actualTimeS: actualSim.finishTimeS,
    actualLapTimes: actualSim.lapTimes,
    deltaTimeS: actualSim.finishTimeS - optimal.timeS,
    timeLostPerLapS,
  }
}

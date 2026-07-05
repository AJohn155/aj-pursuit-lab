// Inverse solvers ("solve for anything"), SPEC §4.11.
//
// Bisection on any single unknown among {avgPowerW, CdA, crr, massKg, rho, targetTimeS}
// given the others, using the §4.10 forward simulator. Finish time is monotonic in each
// of these (more power → faster; more CdA/crr/mass/rho → slower), so bisection is robust.

import { defaultStartPower, simulate } from './simulate'
import type { SimInput } from './simulate'

export interface BisectOptions {
  /** Tolerance on |f(x) − target| in the function's units (default 1e-3). */
  tol?: number
  /** Tolerance on the bracket width (default 1e-6). */
  xtol?: number
  maxIter?: number
}

/**
 * Monotonic bisection: find x∈[lo,hi] with f(x) ≈ target. Works whether f is increasing
 * or decreasing; throws if the target is not bracketed by [f(lo),f(hi)].
 */
export function bisect(
  f: (x: number) => number,
  target: number,
  lo: number,
  hi: number,
  opts: BisectOptions = {},
): number {
  const { tol = 1e-3, xtol = 1e-6, maxIter = 80 } = opts
  let a = lo
  let b = hi
  let fa = f(a) - target
  const fb = f(b) - target
  if (Math.abs(fa) <= tol) return a
  if (Math.abs(fb) <= tol) return b
  if (Math.sign(fa) === Math.sign(fb)) {
    throw new Error(
      `bisect: target ${target} not bracketed by f(${lo})=${fa + target}, f(${hi})=${fb + target}`,
    )
  }
  let mid = (a + b) / 2
  for (let i = 0; i < maxIter; i++) {
    mid = (a + b) / 2
    const fm = f(mid) - target
    if (Math.abs(fm) <= tol || (b - a) / 2 <= xtol) return mid
    // Replace the endpoint on the same side of the root as `mid`, preserving the
    // opposite-sign bracket [a,b]. Only `fa`'s sign is tracked; `fb` stays fixed.
    if (Math.sign(fm) === Math.sign(fa)) {
      a = mid
      fa = fm
    } else {
      b = mid
    }
  }
  return mid
}

/** Base parameters for a solve: everything the sim needs except the one unknown. */
export type SolveBase = Omit<SimInput, 'power' | 'cdaM2' | 'rho'> & {
  power: SimInput['power']
  cdaM2: number
  rho: number
}

function simTime(base: SolveBase, override: Partial<SimInput>): number {
  return simulate({ ...base, ...override }).finishTimeS
}

/** Solve constant power (W) to hit a target finish time. Watts-to-Win uses this at the winner's time. */
export function solvePowerForTime(
  targetTimeS: number,
  base: SolveBase,
  bracket: [number, number] = [150, 800],
  opts?: BisectOptions,
): number {
  return bisect((p) => simTime(base, { power: p }), targetTimeS, bracket[0], bracket[1], opts)
}

/**
 * Solve the steady-power level for the owner-shaped standing-start template
 * (`defaultStartPower`, §4.10) to hit a target finish time — same idea as
 * `solvePowerForTime` but preserves the start-ramp shape instead of flattening to a
 * constant. Used by Pacing's ghost builder and Race Day's required-schedule output
 * (§5.6/§5.7), both of which want "what steady power, ridden with a normal start shape,
 * gets me to time X" rather than a flat target.
 */
export function solveTemplatePowerForTime(
  targetTimeS: number,
  base: SolveBase,
  bracket: [number, number] = [150, 800],
  opts?: BisectOptions,
): number {
  return bisect((w) => simTime(base, { power: defaultStartPower(w) }), targetTimeS, bracket[0], bracket[1], opts)
}

/** Solve CdA (m²) to hit a target finish time (the ΔCdA-to-win alternative, §4.11). */
export function solveCdaForTime(
  targetTimeS: number,
  base: SolveBase,
  bracket: [number, number] = [0.1, 0.4],
  opts?: BisectOptions,
): number {
  return bisect((cda) => simTime(base, { cdaM2: cda }), targetTimeS, bracket[0], bracket[1], opts)
}

/** Solve effective Crr to hit a target finish time. */
export function solveCrrForTime(
  targetTimeS: number,
  base: SolveBase,
  bracket: [number, number] = [0.0005, 0.01],
  opts?: BisectOptions,
): number {
  return bisect(
    (crr) => simTime(base, { params: { ...base.params, crrEff: crr } }),
    targetTimeS,
    bracket[0],
    bracket[1],
    opts,
  )
}

/** Solve system mass (kg) to hit a target finish time. */
export function solveMassForTime(
  targetTimeS: number,
  base: SolveBase,
  bracket: [number, number] = [50, 150],
  opts?: BisectOptions,
): number {
  return bisect(
    (m) => simTime(base, { params: { ...base.params, massKg: m } }),
    targetTimeS,
    bracket[0],
    bracket[1],
    opts,
  )
}

/** Solve air density (kg/m³) to hit a target finish time. */
export function solveRhoForTime(
  targetTimeS: number,
  base: SolveBase,
  bracket: [number, number] = [0.9, 1.35],
  opts?: BisectOptions,
): number {
  return bisect((rho) => simTime(base, { rho }), targetTimeS, bracket[0], bracket[1], opts)
}

export interface WattsToWinResult {
  /** Constant power to match the target time at the rider's parameters. */
  powerToMatchW: number
  /** Alternatively, the CdA that would match the target time at the rider's actual power. */
  cdaToMatchM2: number
}

/**
 * Watts-to-Win (SPEC §4.11): given a winner's target time and the rider's parameters,
 * report both the power needed and the ΔCdA alternative (CdA that matches at actual power).
 */
export function wattsToWin(
  targetTimeS: number,
  base: SolveBase,
  powerBracket?: [number, number],
  cdaBracket?: [number, number],
): WattsToWinResult {
  return {
    powerToMatchW: solvePowerForTime(targetTimeS, base, powerBracket),
    cdaToMatchM2: solveCdaForTime(targetTimeS, base, cdaBracket),
  }
}

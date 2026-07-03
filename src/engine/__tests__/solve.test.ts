import { describe, expect, it } from 'vitest'
import { simulate } from '../simulate'
import {
  bisect,
  solveCdaForTime,
  solveCrrForTime,
  solveMassForTime,
  solvePowerForTime,
  solveRhoForTime,
  wattsToWin,
} from '../solve'
import type { SolveBase } from '../solve'
import { makeTrack } from '../track'
import { DEFAULT_PARAMS } from './synthetic'

const track = makeTrack(250, 23)
const params = DEFAULT_PARAMS
const rho = 1.122

const base: SolveBase = { power: 480, cdaM2: 0.21, rho, params, track, v0: 16.5 }
const T0 = simulate(base).finishTimeS

describe('bisect (SPEC §4.11)', () => {
  it('solves an increasing function', () => {
    // Tight tol forces convergence on the bracket width rather than the function value.
    expect(bisect((x) => x * x, 9, 0, 10, { tol: 1e-9 })).toBeCloseTo(3, 4)
  })
  it('solves a decreasing function', () => {
    expect(bisect((x) => 10 - x, 3, 0, 10, { tol: 1e-9 })).toBeCloseTo(7, 4)
  })
  it('throws when the target is not bracketed', () => {
    expect(() => bisect((x) => x, 100, 0, 10)).toThrow(/not bracketed/)
  })
})

describe('inverse solvers round-trip against the sim (SPEC §4.11)', () => {
  it('solvePowerForTime recovers the power that produced T0', () => {
    expect(solvePowerForTime(T0, base)).toBeCloseTo(480, 1)
  })
  it('solveCdaForTime recovers the CdA that produced T0', () => {
    expect(solveCdaForTime(T0, base)).toBeCloseTo(0.21, 4)
  })
  it('solveCrrForTime recovers the crr that produced T0', () => {
    expect(solveCrrForTime(T0, base)).toBeCloseTo(0.0014, 5)
  })
  it('solveMassForTime recovers the mass that produced T0', () => {
    expect(solveMassForTime(T0, base)).toBeCloseTo(100, 1)
  })
  it('solveRhoForTime recovers the density that produced T0', () => {
    expect(solveRhoForTime(T0, base)).toBeCloseTo(1.122, 3)
  })
})

describe('wattsToWin (SPEC §4.11)', () => {
  it('reports both the power-to-match and the ΔCdA alternative for a faster target', () => {
    const targetTime = T0 - 3 // a rival 3 s quicker
    const { powerToMatchW, cdaToMatchM2 } = wattsToWin(targetTime, base)
    // To go faster: need MORE power, or LESS CdA, than the rider's actuals.
    expect(powerToMatchW).toBeGreaterThan(480)
    expect(cdaToMatchM2).toBeLessThan(0.21)
    // Each solution, plugged back into the sim, hits the target time.
    expect(simulate({ ...base, power: powerToMatchW }).finishTimeS).toBeCloseTo(targetTime, 1)
    expect(simulate({ ...base, cdaM2: cdaToMatchM2 }).finishTimeS).toBeCloseTo(targetTime, 1)
  })
})

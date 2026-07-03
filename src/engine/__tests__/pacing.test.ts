import { describe, expect, it } from 'vitest'
import {
  comparePacing,
  optimizePacing,
  pacingFeasible,
  pacingPowerFn,
} from '../pacing'
import type { PacingBase } from '../pacing'
import { simulate } from '../simulate'
import { wPrimeBalance } from '../wprime'
import { makeTrack } from '../track'
import { DEFAULT_PARAMS } from './synthetic'

const track = makeTrack(250, 23)
const params = DEFAULT_PARAMS
const rho = 1.15
const cp = 400
const wPrime = 30000

const base: PacingBase = { cdaM2: 0.21, rho, params, track, v0: 0.5 }
const grids = {
  startMult: [1.0, 1.2, 1.4],
  settleW: [420, 450, 480],
  endKickFrac: [0.85, 1.0],
}

describe('pacingPowerFn (SPEC §4.14)', () => {
  it('opens harder, settles, then kicks by distance', () => {
    const p = pacingPowerFn({ startMult: 1.3, settleW: 450, endKickFrac: 0.9 }, 250, 4000)
    expect(p(0, 100)).toBeCloseTo(450 * 1.3, 6) // opening (< 1.5 laps = 375 m)
    expect(p(0, 1000)).toBeCloseTo(450, 6) // settle
    expect(p(0, 3800)).toBeGreaterThan(450) // kick (> 0.9 × 4000 = 3600 m)
  })
})

describe('pacingFeasible (SPEC §4.14 W′ constraint)', () => {
  it('flags a schedule that drives W′bal below zero as infeasible', () => {
    const tooHard = new Array(300).fill(cp + 200) // burns 60 000 J > W′
    expect(pacingFeasible(tooHard, 1, cp, wPrime)).toBe(false)
  })
  it('accepts a schedule that stays at or below CP', () => {
    const easy = new Array(300).fill(cp - 50)
    expect(pacingFeasible(easy, 1, cp, wPrime)).toBe(true)
  })
})

describe('optimizePacing (SPEC §4.14)', () => {
  const opt = optimizePacing(base, cp, wPrime, grids)

  it('returns a feasible schedule (finishing W′bal ≥ 0)', () => {
    expect(opt.wPrimeEndJ).toBeGreaterThanOrEqual(0)
    expect(opt.lapTimes).toHaveLength(16)
  })

  it('re-simulating the chosen schedule keeps W′bal ≥ 0 throughout', () => {
    const power = pacingPowerFn(opt.best, track.lapLengthM, 4000)
    const sim = simulate({ ...base, power })
    const bal = wPrimeBalance({ power: sim.samples.map((s) => s.p), dt: 0.1, cp, wPrime })
    expect(Math.min(...bal)).toBeGreaterThanOrEqual(0)
  })

  it('is no slower than an even-pacing effort at the same settle power', () => {
    const even = simulate({ ...base, power: 450 })
    // Even pacing at 450 W must itself be feasible for a fair comparison.
    const evenBal = wPrimeBalance({ power: even.samples.map((s) => s.p), dt: 0.1, cp, wPrime })
    expect(Math.min(...evenBal)).toBeGreaterThanOrEqual(0)
    expect(opt.timeS).toBeLessThanOrEqual(even.finishTimeS + 1e-6)
  })

  it('throws when no grid member is feasible (W′ too small)', () => {
    expect(() => optimizePacing(base, cp, 1, { startMult: [2.0], settleW: [700], endKickFrac: [0.5] })).toThrow(
      /no feasible schedule/,
    )
  })
})

describe('comparePacing (SPEC §4.14)', () => {
  it('reports Δtime and per-lap time lost that sum to the total', () => {
    const cmp = comparePacing(base, 450, cp, wPrime, grids)
    expect(cmp.actualLapTimes).toHaveLength(16)
    expect(cmp.timeLostPerLapS).toHaveLength(16)
    const summed = cmp.timeLostPerLapS.reduce((a, b) => a + b, 0)
    expect(summed).toBeCloseTo(cmp.deltaTimeS, 6)
    // Even pacing is generally not optimal, so some time is lost (≥ 0 within tolerance).
    expect(cmp.deltaTimeS).toBeGreaterThanOrEqual(-1e-6)
  })
})

import { describe, expect, it } from 'vitest'
import { densityScaleSteady } from '../atmosphere'
import {
  equivalentTimeAtRefDensity,
  normalizeLapTimesFast,
  normalizeTimeFull,
} from '../density'
import { simulate } from '../simulate'
import type { SolveBase } from '../solve'
import { makeTrack } from '../track'
import { DEFAULT_PARAMS } from './synthetic'

const track = makeTrack(250, 23)
const params = DEFAULT_PARAMS

describe('normalizeLapTimesFast (SPEC §4.12)', () => {
  it('scales steady laps by the cube-root density ratio', () => {
    const out = normalizeLapTimesFast([15.6, 15.5], 1.1722, 0.9934, false)
    expect(out[0]).toBeCloseTo(15.6 * densityScaleSteady(0.9934, 1.1722), 9)
    expect(out[1]).toBeCloseTo(15.5 * densityScaleSteady(0.9934, 1.1722), 9)
  })

  it('applies the gentler lap-1 blend to the first lap when firstIsLap1', () => {
    const steadyOnly = normalizeLapTimesFast([18, 15.6], 1.1722, 0.9934, false)
    const withLap1 = normalizeLapTimesFast([18, 15.6], 1.1722, 0.9934, true)
    // Target is thinner air (faster); lap 1 speeds up less than a steady lap would.
    expect(withLap1[0]).toBeGreaterThan(steadyOnly[0])
    expect(withLap1[1]).toBeCloseTo(steadyOnly[1], 12) // steady laps identical
  })

  it('is a no-op when target equals ride density', () => {
    expect(normalizeLapTimesFast([15.6, 16.0], 1.15, 1.15, false)).toEqual([15.6, 16.0])
  })
})

describe('normalizeTimeFull vs fast mode (SPEC §4.12)', () => {
  it('full-mode re-simulation broadly agrees with the fast-mode scaling', () => {
    const base: SolveBase = { power: 480, cdaM2: 0.21, rho: 1.2, params, track, v0: 16.5 }
    const rideTime = simulate(base).finishTimeS
    const full = normalizeTimeFull(base, 1.1)
    const fast = rideTime * densityScaleSteady(1.1, 1.2)
    expect(Math.abs(full - fast)).toBeLessThan(1.5) // within ~1.5 s over 4 km
    expect(full).toBeLessThan(rideTime) // thinner air → faster
  })
})

describe('equivalentTimeAtRefDensity (SPEC §4.9/§4.12)', () => {
  it('scales a total time to the reference density', () => {
    expect(equivalentTimeAtRefDensity(246.793, 1.122, 1.15)).toBeCloseTo(
      246.793 * densityScaleSteady(1.15, 1.122),
      9,
    )
  })
})

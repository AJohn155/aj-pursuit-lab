import { describe, expect, it } from 'vitest'
import { airDensity, densityFromAltitude, densityScaleLap1, densityScaleSteady, isaPressureHPa } from '../atmosphere'

describe('airDensity (SPEC §4.2)', () => {
  // Gate 6 (SPEC §7): T=24, P=1006, RH=55 → 1.1722 ± 0.0005.
  it('reproduces gate 6', () => {
    expect(airDensity(24, 1006, 55)).toBeCloseTo(1.1722, 4)
  })

  it('is within the gate-6 tolerance band', () => {
    expect(Math.abs(airDensity(24, 1006, 55) - 1.1722)).toBeLessThan(0.0005)
  })

  it('rises as pressure rises and falls as temperature rises', () => {
    const base = airDensity(20, 1000, 50)
    expect(airDensity(20, 1010, 50)).toBeGreaterThan(base) // more pressure → denser
    expect(airDensity(30, 1000, 50)).toBeLessThan(base) // hotter → thinner
    expect(airDensity(20, 1000, 90)).toBeLessThan(base) // more humid → thinner
  })

  it('gives sea-level-plausible values', () => {
    expect(airDensity(15, 1013.25, 0)).toBeGreaterThan(1.2)
    expect(airDensity(15, 1013.25, 0)).toBeLessThan(1.26)
  })
})

describe('density normalization scales (SPEC §4.12)', () => {
  it('steady scale is the cube root of the density ratio', () => {
    expect(densityScaleSteady(0.9934, 1.1722)).toBeCloseTo(Math.cbrt(0.9934 / 1.1722), 12)
  })

  it('steady scale is 1 when densities match', () => {
    expect(densityScaleSteady(1.15, 1.15)).toBeCloseTo(1, 12)
  })

  it('lap-1 scale is closer to 1 than the steady scale (lap 1 is less aero-dominated)', () => {
    const steady = densityScaleSteady(0.9934, 1.1722)
    const lap1 = densityScaleLap1(0.9934, 1.1722)
    expect(lap1).toBeGreaterThan(steady) // both < 1; lap1 nearer 1
    expect(lap1).toBeLessThan(1)
  })
})

describe('altitude-based density estimate (owner request 2026-07 round 10)', () => {
  it('ISA pressure: sea level 1013.25 hPa; 1880 m ≈ 807 hPa', () => {
    expect(isaPressureHPa(0)).toBeCloseTo(1013.25, 2)
    expect(isaPressureHPa(1880)).toBeGreaterThan(800)
    expect(isaPressureHPa(1880)).toBeLessThan(815)
  })

  it('density falls with altitude and always stays flagged as an estimate by callers', () => {
    const sea = densityFromAltitude(0)
    const cos = densityFromAltitude(1880)
    expect(sea).toBeGreaterThan(1.15)
    expect(sea).toBeLessThan(1.25)
    expect(cos).toBeGreaterThan(0.9)
    expect(cos).toBeLessThan(1.0)
    expect(cos).toBeLessThan(sea)
  })
})

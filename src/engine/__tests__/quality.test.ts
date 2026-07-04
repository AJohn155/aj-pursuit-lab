import { describe, expect, it } from 'vitest'
import { assessQuality } from '../ingest/quality'
import type { QualityInputs } from '../ingest/quality'

const PERFECT: QualityInputs = {
  dropoutSeconds: 0,
  interpolatedFraction: 0,
  officialDeltaS: 0,
  calibrationFactor: 1,
  detectedLapCount: 16,
  expectedLapCount: 16,
  cdaM2: 0.2,
  densityKnown: true,
}

describe('assessQuality (SPEC §4.16)', () => {
  it('scores a flawless ride 100/green with no flags', () => {
    const result = assessQuality(PERFECT)
    expect(result.score).toBe(100)
    expect(result.badge).toBe('green')
    expect(result.flags).toHaveLength(0)
  })

  it('deducts for dropout, capped', () => {
    const light = assessQuality({ ...PERFECT, dropoutSeconds: 4 })
    expect(light.flags).toHaveLength(1)
    expect(light.flags[0].code).toBe('dropout')
    expect(light.score).toBe(98) // 100 - 0.5*4

    const heavy = assessQuality({ ...PERFECT, dropoutSeconds: 100 })
    expect(heavy.score).toBe(85) // capped at -15
  })

  it('ignores sub-tolerance detection mismatch but deducts beyond it', () => {
    const withinTol = assessQuality({ ...PERFECT, officialDeltaS: 0.3 })
    expect(withinTol.flags).toHaveLength(0)

    const beyond = assessQuality({ ...PERFECT, officialDeltaS: -1.5 })
    expect(beyond.flags[0].code).toBe('detection-mismatch')
    expect(beyond.score).toBe(92) // 100 - 8*(1.5-0.5)

    const capped = assessQuality({ ...PERFECT, officialDeltaS: 10 })
    expect(capped.score).toBe(80) // capped at -20
  })

  it('is silent about detection mismatch when no official time was available', () => {
    const result = assessQuality({ ...PERFECT, officialDeltaS: undefined })
    expect(result.flags.find((f) => f.code === 'detection-mismatch')).toBeUndefined()
  })

  it('deducts for calibration factor deviation beyond 1%, scaling with the excess', () => {
    const atTolerance = assessQuality({ ...PERFECT, calibrationFactor: 1.005 })
    expect(atTolerance.flags).toHaveLength(0) // within tolerance, not beyond

    const justOver = assessQuality({ ...PERFECT, calibrationFactor: 1.011 })
    expect(justOver.flags[0].code).toBe('calibration')
    expect(justOver.score).toBeLessThan(86) // ~15pt base deduction plus a small excess term
    expect(justOver.score).toBeGreaterThan(80)

    const wayOff = assessQuality({ ...PERFECT, calibrationFactor: 0.9 })
    expect(wayOff.flags[0].deduction).toBe(25) // capped
  })

  it('flags a lap-count mismatch with a flat deduction', () => {
    const result = assessQuality({ ...PERFECT, detectedLapCount: 15, expectedLapCount: 16 })
    expect(result.flags[0].code).toBe('lap-count')
    expect(result.score).toBe(75)
  })

  it('flags CdA outside the sane range, but not inside it or when absent', () => {
    expect(assessQuality({ ...PERFECT, cdaM2: 0.3 }).flags[0].code).toBe('cda-range')
    expect(assessQuality({ ...PERFECT, cdaM2: 0.2 }).flags).toHaveLength(0)
    expect(assessQuality({ ...PERFECT, cdaM2: undefined }).flags).toHaveLength(0)
  })

  it('flags missing (defaulted) density', () => {
    const result = assessQuality({ ...PERFECT, densityKnown: false })
    expect(result.flags[0].code).toBe('density-missing')
    expect(result.score).toBe(90)
  })

  it('scales the interpolated-fraction deduction up to a 10% saturation point', () => {
    const partial = assessQuality({ ...PERFECT, interpolatedFraction: 0.05 })
    expect(partial.score).toBeCloseTo(92.5, 6) // 100 - 15*0.5

    const saturated = assessQuality({ ...PERFECT, interpolatedFraction: 0.2 })
    expect(saturated.score).toBe(85) // capped at -15
  })

  it('stacks multiple flags and floors the score at 0, never negative', () => {
    const result = assessQuality({
      dropoutSeconds: 200,
      interpolatedFraction: 0.5,
      officialDeltaS: 20,
      calibrationFactor: 0.5,
      detectedLapCount: 10,
      expectedLapCount: 16,
      cdaM2: 0.5,
      densityKnown: false,
    })
    expect(result.score).toBe(0)
    expect(result.badge).toBe('red')
    expect(result.flags.length).toBe(7)
  })

  it('badge thresholds are green ≥85, yellow ≥60, red below', () => {
    // dropout alone caps at -15 → score 85 (boundary, inclusive → green).
    const g = assessQuality({ ...PERFECT, dropoutSeconds: 30 })
    expect(g.score).toBe(85)
    expect(g.badge).toBe('green')

    // + lap-count mismatch (-25) → score 60 (boundary, inclusive → yellow).
    const y60 = assessQuality({ ...PERFECT, dropoutSeconds: 30, detectedLapCount: 10 })
    expect(y60.score).toBe(60)
    expect(y60.badge).toBe('yellow')

    // + CdA out of range instead (-20) → score 65 (mid yellow).
    const y65 = assessQuality({ ...PERFECT, dropoutSeconds: 30, cdaM2: 0.3 })
    expect(y65.score).toBe(65)
    expect(y65.badge).toBe('yellow')

    // + density missing too (-10 more) → score 55 (just under 60 → red).
    const r = assessQuality({ ...PERFECT, dropoutSeconds: 30, cdaM2: 0.3, densityKnown: false })
    expect(r.score).toBe(55)
    expect(r.badge).toBe('red')
  })
})

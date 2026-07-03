import { describe, expect, it } from 'vitest'
import { G } from '../constants'
import {
  bendFraction,
  comSpeedFromWheel,
  cornerFactors,
  isBend,
  lapCrrMultiplier,
  leanAngle,
  makeTrack,
  normalForceMultiplier,
  wheelSpeedRatio,
} from '../track'

const track = makeTrack(250, 23) // L=250, R=23, S derived to close the constraint

describe('makeTrack (SPEC §3.2 constraint)', () => {
  it('derives a straight length that closes L = 2S + 2πR', () => {
    expect(2 * track.straightLengthM + 2 * Math.PI * track.bendRadiusM).toBeCloseTo(250, 9)
  })
})

describe('bendFraction (SPEC §4.3)', () => {
  it('is 2πR/L', () => {
    expect(bendFraction(track)).toBeCloseTo((2 * Math.PI * 23) / 250, 12)
  })
})

describe('isBend segment mapping (SPEC §4.3)', () => {
  const S = track.straightLengthM
  const arc = Math.PI * track.bendRadiusM
  it('classifies the four segments straight/bend/straight/bend', () => {
    expect(isBend(0, track)).toBe(false) // start of straight 1
    expect(isBend(S - 0.01, track)).toBe(false)
    expect(isBend(S + 0.01, track)).toBe(true) // bend 1
    expect(isBend(S + arc - 0.01, track)).toBe(true)
    expect(isBend(S + arc + 0.01, track)).toBe(false) // straight 2
    expect(isBend(2 * S + arc + 0.01, track)).toBe(true) // bend 2
  })

  it('wraps positions outside [0,L)', () => {
    expect(isBend(250, track)).toBe(isBend(0, track))
    expect(isBend(-1, track)).toBe(isBend(249, track))
  })

  it('the fraction of the lap flagged as bend equals bendFraction', () => {
    let bend = 0
    const N = 250000
    for (let i = 0; i < N; i++) if (isBend((i / N) * 250, track)) bend++
    expect(bend / N).toBeCloseTo(bendFraction(track), 3)
  })
})

describe('lean geometry (SPEC §4.3)', () => {
  it('lean angle is atan(v²/gR) and grows with speed', () => {
    expect(leanAngle(17, 23)).toBeCloseTo(Math.atan((17 * 17) / (G * 23)), 12)
    expect(leanAngle(20, 23)).toBeGreaterThan(leanAngle(15, 23))
    expect(leanAngle(0, 23)).toBe(0)
  })

  it('normal-force multiplier equals 1/cos(theta)', () => {
    const v = 17
    const theta = leanAngle(v, 23)
    expect(normalForceMultiplier(v, 23)).toBeCloseTo(1 / Math.cos(theta), 10)
    expect(normalForceMultiplier(0, 23)).toBeCloseTo(1, 12)
  })

  it('wheel-speed ratio exceeds 1 in a bend and is ~1.03 at racing speed', () => {
    const kV = wheelSpeedRatio(17, 23, 1.1)
    expect(kV).toBeGreaterThan(1)
    expect(kV).toBeLessThan(1.05)
  })
})

describe('cornerFactors (SPEC §4.3)', () => {
  it('is all unity on a straight', () => {
    const cf = cornerFactors(17, 0, track, 1.1)
    expect(cf.inBend).toBe(false)
    expect(cf.kN).toBe(1)
    expect(cf.kV).toBe(1)
    expect(cf.theta).toBe(0)
  })

  it('lifts kN and kV in a bend', () => {
    const sInBend = track.straightLengthM + 1
    const cf = cornerFactors(17, sInBend, track, 1.1)
    expect(cf.inBend).toBe(true)
    expect(cf.kN).toBeGreaterThan(1)
    expect(cf.kV).toBeGreaterThan(1)
  })
})

describe('comSpeedFromWheel inversion (SPEC §4.3/§4.9)', () => {
  it('is the exact inverse of v_wheel = v_com·kV in a bend', () => {
    const vCom = 17.3
    const sInBend = track.straightLengthM + 5
    const kV = wheelSpeedRatio(vCom, track.bendRadiusM, 1.1)
    const vWheel = vCom * kV
    expect(Math.abs(comSpeedFromWheel(vWheel, sInBend, track, 1.1) - vCom)).toBeLessThan(1e-8)
  })

  it('is a no-op on a straight (kV = 1)', () => {
    expect(comSpeedFromWheel(17.3, 0, track, 1.1)).toBe(17.3)
  })
})

describe('lapCrrMultiplier (SPEC §4.3)', () => {
  it('is the fBend-weighted blend of straight (1) and bend (kN)', () => {
    const v = 17
    const f = bendFraction(track)
    const kN = normalForceMultiplier(v, track.bendRadiusM)
    expect(lapCrrMultiplier(v, track)).toBeCloseTo((1 - f) + f * kN, 12)
  })

  it('is ≥ 1 and grows with speed', () => {
    expect(lapCrrMultiplier(0, track)).toBeCloseTo(1, 12)
    expect(lapCrrMultiplier(20, track)).toBeGreaterThan(lapCrrMultiplier(10, track))
  })
})

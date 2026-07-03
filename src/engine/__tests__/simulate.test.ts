import { describe, expect, it } from 'vitest'
import { defaultStartPower, simulate } from '../simulate'
import { makeTrack } from '../track'
import { DEFAULT_PARAMS } from './synthetic'

const track = makeTrack(250, 23)
const params = DEFAULT_PARAMS
const rho = 1.122

describe('simulate — structure (SPEC §4.10)', () => {
  it('produces 16 lap splits over 4000 m on a 250 m track', () => {
    const sim = simulate({ power: 480, cdaM2: 0.21, rho, params, track, v0: 16.5 })
    expect(sim.lapSplits).toHaveLength(16)
    expect(sim.lapTimes).toHaveLength(16)
    expect(sim.timedOut).toBe(false)
    // finish time equals the last lap split (crossing of 4000 m)
    expect(sim.finishTimeS).toBeCloseTo(sim.lapSplits[15], 6)
  })

  it('lap splits are strictly increasing and per-lap times are their differences', () => {
    const sim = simulate({ power: 480, cdaM2: 0.21, rho, params, track, v0: 16.5 })
    for (let i = 1; i < sim.lapSplits.length; i++) {
      expect(sim.lapSplits[i]).toBeGreaterThan(sim.lapSplits[i - 1])
    }
    expect(sim.lapTimes[5]).toBeCloseTo(sim.lapSplits[5] - sim.lapSplits[4], 9)
  })
})

describe('simulate — monotonic responses (SPEC §4.10/§4.11 basis)', () => {
  const base = { cdaM2: 0.21, rho, params, track, v0: 16 }
  it('more power → faster', () => {
    expect(simulate({ ...base, power: 500 }).finishTimeS).toBeLessThan(
      simulate({ ...base, power: 450 }).finishTimeS,
    )
  })
  it('more CdA → slower', () => {
    expect(simulate({ ...base, power: 475, cdaM2: 0.22 }).finishTimeS).toBeGreaterThan(
      simulate({ ...base, power: 475, cdaM2: 0.2 }).finishTimeS,
    )
  })
  it('denser air → slower', () => {
    expect(simulate({ ...base, power: 475, rho: 1.2 }).finishTimeS).toBeGreaterThan(
      simulate({ ...base, power: 475, rho: 1.1 }).finishTimeS,
    )
  })
  it('heavier system → slower', () => {
    const heavy = { ...params, massKg: 110 }
    expect(simulate({ ...base, power: 475, params: heavy }).finishTimeS).toBeGreaterThan(
      simulate({ ...base, power: 475 }).finishTimeS,
    )
  })
})

describe('simulate — standing start (SPEC §4.10)', () => {
  it('accelerates from 0.5 m/s and completes 16 laps in a plausible time', () => {
    const sim = simulate({
      power: defaultStartPower(470),
      cdaM2: 0.21,
      rho,
      params,
      track,
      v0: 0.5,
    })
    expect(sim.timedOut).toBe(false)
    expect(sim.lapTimes).toHaveLength(16)
    // 4 km pursuit is roughly 4–5 minutes; the standing lap is the slowest.
    expect(sim.finishTimeS).toBeGreaterThan(230)
    expect(sim.finishTimeS).toBeLessThan(320)
    expect(sim.lapTimes[0]).toBeGreaterThan(sim.lapTimes[8]) // first lap slowest
  })

  it('the default start template ramps to 1.3× by 3 s and settles by 20 s', () => {
    const p = defaultStartPower(400)
    expect(p(0)).toBeCloseTo(0, 6)
    expect(p(3)).toBeCloseTo(520, 6) // 1.3 × 400
    expect(p(20)).toBeCloseTo(400, 6)
    expect(p(60)).toBe(400)
  })
})

describe('simulate — a schedule power function is honored', () => {
  it('accepts P(t,s) and reaches the finish', () => {
    const sim = simulate({
      power: (_t, s) => (s > 2000 ? 520 : 460), // negative-split by distance
      cdaM2: 0.21,
      rho,
      params,
      track,
      v0: 15,
    })
    expect(sim.lapTimes).toHaveLength(16)
    // second half faster than first half (more power)
    const firstHalf = sim.lapSplits[7]
    const secondHalf = sim.finishTimeS - sim.lapSplits[7]
    expect(secondHalf).toBeLessThan(firstHalf)
  })
})

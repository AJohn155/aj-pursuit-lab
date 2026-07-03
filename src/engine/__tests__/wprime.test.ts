import { describe, expect, it } from 'vitest'
import { estimateCpWprime, wPrimeBalance, wPrimeEnd, wPrimeMin } from '../wprime'

const cp = 400
const wPrime = 20000

describe('wPrimeBalance depletion (SPEC §4.13)', () => {
  it('depletes by exactly (P−CP)·dt while above CP', () => {
    const series = wPrimeBalance({ power: new Array(100).fill(500), dt: 1, cp, wPrime })
    // 100 s at +100 W over CP → 10 000 J spent.
    expect(series.at(-1)).toBeCloseTo(wPrime - 100 * 100, 6)
    expect(series[0]).toBeCloseTo(wPrime - 100, 6)
  })

  it('is monotonically decreasing under constant supra-CP power', () => {
    const series = wPrimeBalance({ power: new Array(50).fill(600), dt: 1, cp, wPrime })
    for (let i = 1; i < series.length; i++) expect(series[i]).toBeLessThan(series[i - 1])
  })

  it('can go negative when the tank is overspent', () => {
    const series = wPrimeBalance({ power: new Array(300).fill(500), dt: 1, cp, wPrime })
    expect(Math.min(...series)).toBeLessThan(0)
  })
})

describe('wPrimeBalance recovery (SPEC §4.13)', () => {
  it('recovers toward W′ while below CP, faster at lower power', () => {
    // Spend down, then recover at two intensities; the easier spin recovers more.
    const spend = new Array(60).fill(600)
    const recEasy = wPrimeBalance({ power: [...spend, ...new Array(200).fill(150)], dt: 1, cp, wPrime })
    const recHard = wPrimeBalance({ power: [...spend, ...new Array(200).fill(350)], dt: 1, cp, wPrime })
    expect(recEasy.at(-1)).toBeGreaterThan(recHard.at(-1)!)
    // recovery moves balance upward from its post-spend low
    expect(recEasy.at(-1)).toBeGreaterThan(recEasy[59])
  })

  it('uses the spec τ = 546·e^(−0.01(CP−P)) + 316 (larger deficit → faster recovery)', () => {
    // Spend exactly 10 000 J (10 s at +1000 W over CP), then recover one step below CP.
    // The recovery step must match the closed-form relaxation toward W′ with the spec τ.
    const dt = 1
    const spend = new Array(10).fill(cp + 1000) // lands balance at wPrime − 10 000
    const bal0 = wPrime - 10000
    for (const P of [200, 300]) {
      const series = wPrimeBalance({ power: [...spend, P], dt, cp, wPrime })
      const tau = 546 * Math.exp(-0.01 * (cp - P)) + 316
      const expected = wPrime - (wPrime - bal0) * Math.exp(-dt / tau)
      expect(series.at(-1)).toBeCloseTo(expected, 6)
    }
    // Larger deficit (P=200, CP−P=200) recovers with a shorter τ than P=300.
    const tau200 = 546 * Math.exp(-0.01 * (cp - 200)) + 316
    const tau300 = 546 * Math.exp(-0.01 * (cp - 300)) + 316
    expect(tau200).toBeLessThan(tau300)
  })
})

describe('wPrimeEnd / wPrimeMin (SPEC §4.13/§4.15)', () => {
  it('report the final and minimum balances', () => {
    const power = [...new Array(60).fill(600), ...new Array(120).fill(200)]
    const series = wPrimeBalance({ power, dt: 1, cp, wPrime })
    expect(wPrimeEnd({ power, dt: 1, cp, wPrime })).toBeCloseTo(series.at(-1)!, 9)
    expect(wPrimeMin({ power, dt: 1, cp, wPrime })).toBeCloseTo(Math.min(...series), 9)
  })
})

describe('estimateCpWprime (SPEC §4.13)', () => {
  it('recovers known CP/W′ from mean-maximal points at 180/240/300 s', () => {
    const cpT = 380
    const wpT = 22000
    const points = [180, 240, 300].map((t) => ({ durationS: t, powerW: cpT + wpT / t }))
    const est = estimateCpWprime(points)
    expect(est.cp).toBeCloseTo(cpT, 6)
    expect(est.wPrime).toBeCloseTo(wpT, 3)
  })

  it('throws with fewer than two points', () => {
    expect(() => estimateCpWprime([{ durationS: 240, powerW: 470 }])).toThrow()
  })
})

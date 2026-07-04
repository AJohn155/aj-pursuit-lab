import { describe, expect, it } from 'vitest'
import {
  CDA_SANE_MAX,
  CDA_SANE_MIN,
  cdaInSaneRange,
  cdaPerLap,
  cdaRace,
  cdaRolling,
  ci95FromScatter,
  energyBalanceCda,
} from '../cda'
import { simulate } from '../simulate'
import { makeTrack } from '../track'
import { constantVComSamples, lapSamplesFromSim, DEFAULT_PARAMS } from './synthetic'

const track = makeTrack(250, 23)
const params = DEFAULT_PARAMS

describe('energyBalanceCda — exact recovery (SPEC §4.9)', () => {
  // With constant COM speed, ΔKE = 0 and the acceleration work term vanishes, so the
  // energy balance must return the CdA the samples were built from, to machine precision.
  it('recovers the ground-truth CdA from constant-COM-speed samples', () => {
    const rho = 1.122
    const cda = 0.2
    const samples = constantVComSamples({ track, params, rho, cda, vCom: 17, nSamples: 600 })
    const out = energyBalanceCda({ samples, rho, params, track })
    expect(out.cdaM2).toBeCloseTo(cda, 6)
    expect(out.dKeJ).toBeCloseTo(0, 6)
  })

  it('the energy accounting identity holds exactly (E_in = ΔKE + E_roll + E_aero)', () => {
    const rho = 1.122
    const samples = constantVComSamples({ track, params, rho, cda: 0.2, vCom: 17, nSamples: 300 })
    const b = energyBalanceCda({ samples, rho, params, track })
    expect(b.eInJ - (b.dKeJ + b.eRollJ + b.eAeroJ)).toBeCloseTo(0, 6)
  })

  it('recovers CdA across the plausible range', () => {
    const rho = 1.15
    for (const cda of [0.16, 0.2, 0.24]) {
      const samples = constantVComSamples({ track, params, rho, cda, vCom: 16.5, nSamples: 500 })
      expect(energyBalanceCda({ samples, rho, params, track }).cdaM2).toBeCloseTo(cda, 6)
    }
  })
})

describe('energyBalanceCda — constant-power lap (SPEC §4.9, worked example)', () => {
  // Simulate a constant-power effort, then run the energy balance on one settled interior
  // lap. Speed varies through the lap here (constant power, not constant speed), so this
  // exercises ΔKE and the full pipeline; recovery is near-exact because the lap is settled.
  it('recovers the simulated CdA from a constant-power interior lap', () => {
    const rho = 1.122
    const cda = 0.21
    const power = 480
    const sim = simulate({ power, cdaM2: cda, rho, params, track, v0: 16.5 })
    const lap = lapSamplesFromSim(sim, 8, track, params)
    const b = energyBalanceCda({ samples: lap, rho, params, track })

    expect(b.cdaM2).toBeCloseTo(cda, 3) // within 5e-4
    // The breakdown should read like a real energy budget: E_in split into a large aero
    // term, a small rolling term, and a near-zero ΔKE on a settled lap.
    expect(b.eInJ).toBeGreaterThan(0)
    expect(b.eAeroJ).toBeGreaterThan(b.eRollJ) // aero dominates on the track
    expect(Math.abs(b.dKeJ)).toBeLessThan(0.02 * b.eInJ) // settled lap: KE barely changes
    expect(b.cdaM2).toBeCloseTo(b.eAeroJ / b.aeroDenomJ, 12) // CdA = E_aero / Σ½ρv³dt
  })
})

describe('startEnergy inclusion (SPEC §4.6/§4.9)', () => {
  it('adds startEnergyJ into E_in only when supplied', () => {
    const rho = 1.15
    const samples = constantVComSamples({ track, params, rho, cda: 0.2, vCom: 16, nSamples: 200 })
    const without = energyBalanceCda({ samples, rho, params, track })
    const withStart = energyBalanceCda({ samples, rho, params, track, startEnergyJ: 5000 })
    expect(withStart.eInJ - without.eInJ).toBeCloseTo(5000, 6)
    expect(withStart.cdaM2).toBeGreaterThan(without.cdaM2) // extra input energy → more aero
  })
})

describe('cdaPerLap, cdaRace and CI (SPEC §4.9)', () => {
  function lapGroups(cda: number, rho: number, nLaps: number) {
    // Build nLaps back-to-back constant-COM-speed laps as separate groups.
    const perLap = Math.ceil(250 / (16.5 * 0.1)) // samples per lap
    const groups = []
    for (let i = 0; i < nLaps; i++) {
      groups.push(
        constantVComSamples({ track, params, rho, cda, vCom: 16.5, nSamples: perLap }),
      )
    }
    return groups
  }

  it('per-lap CdA recovers the ground truth on every lap', () => {
    const laps = lapGroups(0.205, 1.122, 14)
    for (const c of cdaPerLap(laps, 1.122, params, track)) expect(c).toBeCloseTo(0.205, 5)
  })

  it('cdaRace equals the whole-window balance and CI is ~0 for identical laps', () => {
    const laps = lapGroups(0.205, 1.122, 14)
    const res = cdaRace(laps, 1.122, params, track)
    expect(res.cdaRace).toBeCloseTo(0.205, 5)
    expect(res.ci95).toBeLessThan(1e-6) // no lap-to-lap scatter
  })

  it('CI half-width grows with lap-to-lap scatter', () => {
    expect(ci95FromScatter([0.2, 0.2, 0.2])).toBeLessThan(1e-9)
    expect(ci95FromScatter([0.19, 0.2, 0.21])).toBeGreaterThan(0)
    expect(ci95FromScatter([0.18, 0.2, 0.22])).toBeGreaterThan(
      ci95FromScatter([0.19, 0.2, 0.21]),
    )
  })
})

describe('two-ride agreement + sane range (synthetic gate 4, SPEC §7)', () => {
  // Fixture gate 4 (real .fit) lands in P3. Synthetic form: two rides at nearby CdA and the
  // event densities must both land in [0.16,0.26] and agree within 0.015 m².
  it('two synthetic rides recover in-range and within 0.015 m² of each other', () => {
    const quali = energyBalanceCda({
      samples: constantVComSamples({ track, params, rho: 1.122, cda: 0.205, vCom: 17, nSamples: 500 }),
      rho: 1.122,
      params,
      track,
    }).cdaM2
    const final = energyBalanceCda({
      samples: constantVComSamples({ track, params, rho: 1.116, cda: 0.212, vCom: 16.8, nSamples: 500 }),
      rho: 1.116,
      params,
      track,
    }).cdaM2
    expect(cdaInSaneRange(quali)).toBe(true)
    expect(cdaInSaneRange(final)).toBe(true)
    expect(Math.abs(quali - final)).toBeLessThan(0.015)
  })

  it('sane-range predicate matches the [0.16,0.26] bounds', () => {
    expect(cdaInSaneRange(CDA_SANE_MIN)).toBe(true)
    expect(cdaInSaneRange(CDA_SANE_MAX)).toBe(true)
    expect(cdaInSaneRange(0.15)).toBe(false)
    expect(cdaInSaneRange(0.27)).toBe(false)
  })
})

describe('cdaRolling (SPEC §4.9 display-only diagnostic)', () => {
  // Build a continuous 4-lap constant-COM-speed series with its cumulative datum distance
  // tracked alongside (constantVComSamples doesn't carry distance, so it's derived here
  // from the same constant-speed stepping the helper uses internally).
  function seriesWithDistance(cda: number, rho: number, vCom: number, dt = 0.1, laps = 4) {
    const nSamples = Math.round((laps * track.lapLengthM) / (vCom * dt))
    const samples = constantVComSamples({ track, params, rho, cda, vCom, nSamples, dt })
    const distCumM = samples.map((_, i) => i * vCom * dt)
    return { samples, distCumM }
  }

  it('recovers the ground-truth CdA at every rolling window on a uniform effort', () => {
    const { samples, distCumM } = seriesWithDistance(0.2, 1.122, 17)
    const points = cdaRolling(samples, distCumM, 1.122, params, track)
    expect(points.length).toBeGreaterThan(5)
    for (const p of points) expect(p.cdaM2).toBeCloseTo(0.2, 3)
  })

  it('window centers advance by the ¼-lap step and stay within the data span', () => {
    const { samples, distCumM } = seriesWithDistance(0.2, 1.122, 17)
    const points = cdaRolling(samples, distCumM, 1.122, params, track)
    for (let i = 1; i < points.length; i++) {
      expect(points[i].centerDistM - points[i - 1].centerDistM).toBeCloseTo(track.lapLengthM / 4, 6)
    }
    const halfWindow = track.lapLengthM / 2
    expect(points[0].centerDistM).toBeGreaterThanOrEqual(distCumM[0] + halfWindow - 1e-6)
    expect(points.at(-1)!.centerDistM).toBeLessThanOrEqual(distCumM.at(-1)! - halfWindow + 1e-6)
  })

  it('returns empty for mismatched-length inputs guard and for empty input', () => {
    expect(() => cdaRolling([{ dt: 1, powerW: 1, vCom: 1, s: 0 }], [], 1.15, params, track)).toThrow()
    expect(cdaRolling([], [], 1.15, params, track)).toEqual([])
  })
})

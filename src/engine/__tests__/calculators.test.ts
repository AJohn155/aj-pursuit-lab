import { describe, expect, it } from 'vitest'
import {
  KPH_TO_MS,
  adjustLapTimesFastByDensity,
  adjustLapTimesFast,
  cadenceGrid,
  cadenceRpm,
  powerForSpeedFlat,
  powerForSpeedTrack,
  rangeInclusive,
  wattsSavedAero,
  wattsSavedGrid,
} from '../calculators'
import { makeTrack } from '../track'

describe('gate 7 — calculator ports (SPEC §7 / §5.8)', () => {
  it('power-for-speed at 63 km/h → 684.29 W (±0.5)', () => {
    const p = powerForSpeedFlat(63 * KPH_TO_MS, 0.212, 1.12, 100, 0.002, 0.98)
    expect(p).toBeCloseTo(684.29, 1)
    expect(Math.abs(p - 684.29)).toBeLessThan(0.5)
  })

  it('watts-saved at 60 km/h, 5 counts, ρ 1.15 → 13.31 W (±0.05)', () => {
    const dp = wattsSavedAero(60 * KPH_TO_MS, 5, 1.15)
    expect(Math.abs(dp - 13.31)).toBeLessThan(0.05)
  })

  it('time adjuster: 15.6 s from ρ 1.1722 → 0.9934 gives 14.7626 s (±0.005)', () => {
    const out = adjustLapTimesFastByDensity([15.6], 1.1722, 0.9934, false)[0]
    expect(Math.abs(out - 14.7626)).toBeLessThan(0.005)
  })
})

describe('cadence calculator (SPEC §5.8)', () => {
  it('computes rpm for a lap time / gear / venue lap length', () => {
    // 250 m lap in 15 s on 65×15, rollout 2.09 → ~110.4 rpm.
    expect(cadenceRpm(15, 250, 2.09, 65, 15)).toBeCloseTo(110.42, 1)
  })

  it('a bigger gear turns slower for the same lap time', () => {
    expect(cadenceRpm(15, 250, 2.09, 65, 15)).toBeLessThan(cadenceRpm(15, 250, 2.09, 60, 15))
  })

  it('cadence scales inversely with lap time', () => {
    const fast = cadenceRpm(14, 250, 2.09, 65, 15)
    const slow = cadenceRpm(16, 250, 2.09, 65, 15)
    expect(fast).toBeGreaterThan(slow)
    // rpm × time is constant (fixed distance & gear)
    expect(fast * 14).toBeCloseTo(slow * 16, 6)
  })

  it('builds a lap-time × gear grid over the default 13.0–17.0 s rows', () => {
    const grid = cadenceGrid([{ chainring: 65, cog: 15 }, { chainring: 64, cog: 15 }], 250, 2.09)
    expect(grid.lapTimesS[0]).toBe(13.0)
    expect(grid.lapTimesS.at(-1)).toBe(17.0)
    expect(grid.lapTimesS).toHaveLength(41)
    expect(grid.cells).toHaveLength(41)
    expect(grid.cells[0]).toHaveLength(2)
    expect(grid.cells[0][0]).toBeCloseTo(cadenceRpm(13.0, 250, 2.09, 65, 15), 9)
  })
})

describe('power-for-speed track mode (SPEC §5.8)', () => {
  it('track mode ≥ flat mode (cornering lifts the rolling term)', () => {
    const track = makeTrack(250, 23)
    const v = 60 * KPH_TO_MS
    const flat = powerForSpeedFlat(v, 0.21, 1.15, 100, 0.0014, 0.98)
    const trk = powerForSpeedTrack(v, 0.21, 1.15, 100, 0.0014, 0.98, track)
    expect(trk).toBeGreaterThan(flat)
    // The lift is only the rolling term × (kCrrLap − 1), a small fraction of total power.
    expect(trk - flat).toBeLessThan(0.05 * flat)
  })
})

describe('watts-saved grid (SPEC §5.8)', () => {
  it('scales linearly with counts and cubically with speed', () => {
    const grid = wattsSavedGrid([10, 20], [1, 2], 1.15)
    // linear in counts
    expect(grid.cells[0][1]).toBeCloseTo(2 * grid.cells[0][0], 9)
    // cubic in speed: doubling v → ×8
    expect(grid.cells[1][0]).toBeCloseTo(8 * grid.cells[0][0], 9)
  })
})

describe('time adjuster via environment blocks (SPEC §5.8 → §4.2 → §4.12)', () => {
  it('matches the direct-density path when envs map to those densities', () => {
    // Fast mode, no lap-1 blend: adjusting to the same environment is a no-op.
    const env = { tempC: 24, pressureHPa: 1006, rhPct: 55 }
    const out = adjustLapTimesFast([15.6, 15.7], env, env, false)
    expect(out[0]).toBeCloseTo(15.6, 9)
    expect(out[1]).toBeCloseTo(15.7, 9)
  })

  it('applies the lap-1 blend to the first element when firstIsLap1', () => {
    const rideEnv = { tempC: 24, pressureHPa: 1006, rhPct: 55 }
    const coolEnv = { tempC: 10, pressureHPa: 1006, rhPct: 55 } // denser → slower
    const [lap1, lap2] = adjustLapTimesFast([18.0, 15.6], rideEnv, coolEnv, true)
    // Denser target slows both, but lap 1 responds less than a steady lap.
    expect(lap1).toBeGreaterThan(18.0)
    expect(lap2).toBeGreaterThan(15.6)
    const lap1Scale = lap1 / 18.0
    const lap2Scale = lap2 / 15.6
    expect(lap1Scale).toBeLessThan(lap2Scale) // lap 1 scaled less (blend toward 1)
  })
})

describe('rangeInclusive helper', () => {
  it('includes both endpoints without floating-point drift', () => {
    const r = rangeInclusive(13.0, 17.0, 0.1)
    expect(r[0]).toBe(13.0)
    expect(r.at(-1)).toBe(17.0)
    expect(r).toContain(15.6)
  })
})

describe('timeSavedForCdaReduction (owner item 6, 2026-07 — configurable-distance savings)', () => {
  it('round-trips: speedAtPowerFlat inverts powerForSpeedFlat', async () => {
    const { powerForSpeedFlat, speedAtPowerFlat } = await import('../calculators')
    const p = powerForSpeedFlat(16.7, 0.19, 1.15, 100, 0.0014, 0.98)
    expect(speedAtPowerFlat(p, 0.19, 1.15, 100, 0.0014, 0.98)).toBeCloseTo(16.7, 4)
  })

  it('is positive, monotonic in counts, and scales roughly with distance', async () => {
    const { timeSavedForCdaReduction } = await import('../calculators')
    const args = [1.15, 100, 0.0014, 0.98, 0.19] as const
    const t4k5 = timeSavedForCdaReduction(16.7, 5, ...args, 4000, 250)
    const t4k10 = timeSavedForCdaReduction(16.7, 10, ...args, 4000, 250)
    const t40k5 = timeSavedForCdaReduction(16.7, 5, ...args, 40000, 0)
    expect(t4k5).toBeGreaterThan(0)
    expect(t4k10).toBeGreaterThan(t4k5 * 1.8)
    // 40 km with no start lap ≈ (40000/3750)× the 4 km remaining-distance saving.
    expect(t40k5 / t4k5).toBeCloseTo(40000 / 3750, 0)
    // Sanity magnitude: ~0.4 s/count over 4 km at pursuit speed (matches the Gains
    // tornado's ~4 s for 10 counts).
    expect(t4k5).toBeGreaterThan(1.5)
    expect(t4k5).toBeLessThan(3)
  })
})

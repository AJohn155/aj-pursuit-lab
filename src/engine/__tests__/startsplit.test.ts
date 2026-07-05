import { describe, expect, it } from 'vitest'
import { powerForSpeedTrack } from '../calculators'
import { makeTrack } from '../track'
import { settleSpeedForPower, solveSettlePowerForTime, startSplitPlan } from '../startsplit'
import type { StartSplitBase } from '../startsplit'

const track = makeTrack(250, 23)
const base: StartSplitBase = {
  cdaM2: 0.17,
  rho: 1.12,
  params: { massKg: 100, rotatingMassEqKg: 1, crrEff: 0.0014, mechEfficiency: 0.98, comHeightM: 1.1 },
  track,
}

describe('start-split + settle-power model (owner item 12, 2026-07)', () => {
  it('settleSpeedForPower inverts powerForSpeedTrack', () => {
    const v = settleSpeedForPower(480, base)
    const p = powerForSpeedTrack(v, base.cdaM2, base.rho, base.params.massKg, base.params.crrEff, base.params.mechEfficiency, track)
    expect(p).toBeCloseTo(480, 1)
    expect(v).toBeGreaterThan(14)
    expect(v).toBeLessThan(20)
  })

  it('startSplitPlan: lap 1 is the entered split, laps 2..16 are near-even at settle speed', () => {
    const plan = startSplitPlan(21.5, 480, base)
    expect(plan.lapTimes).toHaveLength(16)
    expect(plan.lapTimes[0]).toBe(21.5)
    // Starting AT the settle speed, the remaining laps should be nearly even.
    const rest = plan.lapTimes.slice(1)
    const spread = Math.max(...rest) - Math.min(...rest)
    expect(spread).toBeLessThan(0.2)
    // Total is consistent: start split + sim time.
    expect(plan.predictedTimeS).toBeCloseTo(21.5 + plan.sim.finishTimeS, 9)
    expect(plan.lapSplits[15]).toBeCloseTo(plan.predictedTimeS, 6)
    // Sanity: even-lap time ≈ 3750 / settleSpeed.
    expect(plan.sim.finishTimeS).toBeCloseTo(3750 / plan.settleSpeedMs, 0)
  })

  it('solveSettlePowerForTime round-trips through startSplitPlan', () => {
    const target = startSplitPlan(21.5, 495, base).predictedTimeS
    const solved = solveSettlePowerForTime(target, 21.5, base)
    expect(solved).toBeCloseTo(495, 1)
  })

  it('more settle power → faster total, holding the start split fixed', () => {
    const t450 = startSplitPlan(21.5, 450, base).predictedTimeS
    const t500 = startSplitPlan(21.5, 500, base).predictedTimeS
    expect(t500).toBeLessThan(t450)
  })
})

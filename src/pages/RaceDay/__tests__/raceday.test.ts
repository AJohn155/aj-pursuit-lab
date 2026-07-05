import { describe, expect, it } from 'vitest'
import type { Venue } from '../../../store/types'
import { computeRaceDayPlan } from '../raceday'

const venue: Venue = {
  id: 'venue-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  name: 'VELO Sports Center',
  city: 'LA',
  country: 'USA',
  lapLengthM: 250,
  bendRadiusM: 23,
  straightLengthM: 42,
  bankingDeg: 45,
  indoor: true,
  altitudeM: 15,
  surfaceFactor: 1.0,
  geometrySource: 'published',
  notes: '',
}

const baseInputs = {
  venue,
  rho: 1.15,
  massKg: 100,
  cdaM2: 0.19,
  crrTyre: 0.0014,
  rotatingMassEqKg: 1.0,
  mechEfficiency: 0.98,
  comHeightM: 1.1,
  rolloutM: 2.09,
  gear: { chainring: 65, cog: 15 },
  start: { kind: 'template' } as const,
}

describe('computeRaceDayPlan (SPEC §5.7)', () => {
  it('a goal-time plan hits the target time and returns 16 lap times / cadences', () => {
    const plan = computeRaceDayPlan({ ...baseInputs, goal: { kind: 'time', targetTimeS: 245 } })
    expect(plan.predictedTimeS).toBeCloseTo(245, 0)
    expect(plan.lapTimes).toHaveLength(16)
    expect(plan.cadenceRpm).toHaveLength(16)
    expect(plan.steadyW).toBeGreaterThan(0)
  })

  it('a goal-power plan simulates that power directly (no solve) and reports a sensible time', () => {
    const plan = computeRaceDayPlan({ ...baseInputs, goal: { kind: 'power', powerW: 480 } })
    expect(plan.steadyW).toBe(480)
    expect(plan.predictedTimeS).toBeGreaterThan(200)
    expect(plan.predictedTimeS).toBeLessThan(300)
  })

  it('start-split mode: lap 1 is exactly the entered split; goal-time solve hits target (2026-07 item 12)', () => {
    const plan = computeRaceDayPlan({
      ...baseInputs,
      goal: { kind: 'time', targetTimeS: 245 },
      start: { kind: 'split', startLapS: 21.5 },
    })
    expect(plan.lapTimes[0]).toBe(21.5)
    expect(plan.predictedTimeS).toBeCloseTo(245, 1)
    expect(plan.lapTimes).toHaveLength(16)
    // Laps 2+ are near-even (ridden at settle speed).
    const rest = plan.lapTimes.slice(1)
    expect(Math.max(...rest) - Math.min(...rest)).toBeLessThan(0.2)
  })

  it('cadence scales inversely with lap time for a fixed gear', () => {
    const plan = computeRaceDayPlan({ ...baseInputs, goal: { kind: 'power', powerW: 480 } })
    // Steady laps (not lap 1, which includes the standing-start ramp) should have
    // similar cadence since lap times converge; cadence formula itself is checked in
    // engine/__tests__ already — this just confirms wiring (positive, plausible rpm).
    for (const rpm of plan.cadenceRpm.slice(2)) {
      expect(rpm).toBeGreaterThan(80)
      expect(rpm).toBeLessThan(200)
    }
  })
})

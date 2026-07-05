// Race Day (SPEC §5.7): venue + environment + gear + goal (time or power) → required lap
// schedule (owner-shaped start ramp), required steady power, cadence per lap, density
// readout. Kept pure and unit-tested like the other pages' glue modules.

import { effectiveCrr, makeTrack } from '../../engine/index'
import { cadenceRpm } from '../../engine/calculators'
import { defaultStartPower, simulate } from '../../engine/simulate'
import { solveTemplatePowerForTime } from '../../engine/solve'
import type { SolveBase } from '../../engine/solve'
import type { Gear } from '../../engine/calculators'
import type { Venue } from '../../store/types'

export type RaceDayGoal = { kind: 'time'; targetTimeS: number } | { kind: 'power'; powerW: number }

export interface RaceDayInputs {
  venue: Venue
  rho: number
  massKg: number
  cdaM2: number
  crrTyre: number
  rotatingMassEqKg: number
  mechEfficiency: number
  comHeightM: number
  rolloutM: number
  gear: Gear
  goal: RaceDayGoal
}

export interface RaceDayPlan {
  steadyW: number
  predictedTimeS: number
  lapTimes: number[]
  cadenceRpm: number[]
}

const DEFAULT_POWER_BRACKET: [number, number] = [150, 800]

/**
 * Builds the required schedule for a Race Day plan (§5.7). A "goal power" run doesn't
 * need to solve anything — it just simulates that power with the owner-shaped start
 * template; a "goal time" run inverts for the steady power via the same
 * `solveTemplatePowerForTime` the Pacing ghost builder uses (§4.11 extended to the
 * template shape), so both goal kinds report the same fields.
 */
export function computeRaceDayPlan(inputs: RaceDayInputs): RaceDayPlan {
  const { venue, rho, massKg, cdaM2, crrTyre, rotatingMassEqKg, mechEfficiency, comHeightM, rolloutM, gear, goal } =
    inputs
  const track = makeTrack(venue.lapLengthM, venue.bendRadiusM)
  const params = {
    massKg,
    rotatingMassEqKg,
    crrEff: effectiveCrr(crrTyre, venue.surfaceFactor),
    mechEfficiency,
    comHeightM,
  }
  const base: SolveBase = { power: 0, cdaM2, rho, params, track, v0: 0.5, distanceM: 4000 }

  const steadyW =
    goal.kind === 'time' ? solveTemplatePowerForTime(goal.targetTimeS, base, DEFAULT_POWER_BRACKET) : goal.powerW

  const sim = simulate({ ...base, power: defaultStartPower(steadyW) })
  const cadence = sim.lapTimes.map((lt) => cadenceRpm(lt, venue.lapLengthM, rolloutM, gear.chainring, gear.cog))

  return { steadyW, predictedTimeS: sim.finishTimeS, lapTimes: sim.lapTimes, cadenceRpm: cadence }
}

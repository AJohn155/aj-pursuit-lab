// Race Day (SPEC §5.7): venue + environment + gear + goal (time or power) → required lap
// schedule (owner-shaped start ramp), required steady power, cadence per lap, density
// readout. Kept pure and unit-tested like the other pages' glue modules.

import { effectiveCrr, makeTrack } from '../../engine/index'
import { cadenceRpm } from '../../engine/calculators'
import { defaultStartPower, simulate } from '../../engine/simulate'
import { solveTemplatePowerForTime } from '../../engine/solve'
import type { SolveBase } from '../../engine/solve'
import { solveSettlePowerForTime, startSplitPlan } from '../../engine/startsplit'
import type { Gear } from '../../engine/calculators'
import type { Venue } from '../../store/types'

export type RaceDayGoal = { kind: 'time'; targetTimeS: number } | { kind: 'power'; powerW: number }

/** How lap 1 is modeled: the owner-shaped start template (simulated from a standing
 * start), or a directly-entered expected start split with everything after ridden at the
 * settle power from at-speed (owner request 2026-07 item 12). */
export type RaceDayStart = { kind: 'template' } | { kind: 'split'; startLapS: number }

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
  start: RaceDayStart
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
 * need to solve anything; a "goal time" run inverts for the steady power. With the
 * template start, lap 1 comes from simulating the owner-shaped start ramp; with a
 * start-split start, lap 1 is exactly the entered split and the rest rides at the settle
 * power from at-speed (engine/startsplit.ts).
 */
export function computeRaceDayPlan(inputs: RaceDayInputs): RaceDayPlan {
  const { venue, rho, massKg, cdaM2, crrTyre, rotatingMassEqKg, mechEfficiency, comHeightM, rolloutM, gear, goal, start } =
    inputs
  const track = makeTrack(venue.lapLengthM, venue.bendRadiusM)
  const params = {
    massKg,
    rotatingMassEqKg,
    crrEff: effectiveCrr(crrTyre, venue.surfaceFactor),
    mechEfficiency,
    comHeightM,
  }

  let steadyW: number
  let predictedTimeS: number
  let lapTimes: number[]

  if (start.kind === 'split') {
    const ssBase = { cdaM2, rho, params, track }
    steadyW =
      goal.kind === 'time'
        ? solveSettlePowerForTime(goal.targetTimeS, start.startLapS, ssBase, DEFAULT_POWER_BRACKET)
        : goal.powerW
    const plan = startSplitPlan(start.startLapS, steadyW, ssBase)
    predictedTimeS = plan.predictedTimeS
    lapTimes = plan.lapTimes
  } else {
    const base: SolveBase = { power: 0, cdaM2, rho, params, track, v0: 0.5, distanceM: 4000 }
    steadyW =
      goal.kind === 'time' ? solveTemplatePowerForTime(goal.targetTimeS, base, DEFAULT_POWER_BRACKET) : goal.powerW
    const sim = simulate({ ...base, power: defaultStartPower(steadyW) })
    predictedTimeS = sim.finishTimeS
    lapTimes = sim.lapTimes
  }

  const cadence = lapTimes.map((lt) => cadenceRpm(lt, venue.lapLengthM, rolloutM, gear.chainring, gear.cog))
  return { steadyW, predictedTimeS, lapTimes, cadenceRpm: cadence }
}
